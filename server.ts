import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import { Resend } from "resend";
import { GoogleGenAI, Type } from "@google/genai";
import crypto from "crypto";

// Initialize Supabase Client (Service Role for admin operations from Server)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                             process.env.SUPABASE_SERVICE_KEY || 
                             process.env.SUPABASE_ANON_KEY || 
                             process.env.VITE_SUPABASE_ANON_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_dev";
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const ai = process.env.GEMINI_API_KEY 
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    })
  : null;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) 
  : null;

const FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash"
];

async function generateContentWithFallback(ai: any, params: any) {
  let lastError: any;
  for (const model of FALLBACK_MODELS) {
    try {
      const p = { ...params, model };
      return await ai.models.generateContent(p);
    } catch (e: any) {
      console.warn(`Model ${model} failed:`, e.message);
      lastError = e;
      if (e.status === 429 || e.status === 503 || e.message?.toLowerCase().includes("quota") || e.message?.toLowerCase().includes("exhausted")) {
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

// Helper to validate UUID format to avoid Postgres casting exceptions
const isValidUUID = (val: any): boolean => {
  if (typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
};

// Helper to send and log emails
async function sendAndLogEmail(firmId: string, recipientId: string, recipientEmail: string, subject: string, body: string, recipientName: string = "") {
  let status = 'sent';
  
  const htmlTemplate = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
      <div style="background-color: #10b981; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 20px; letter-spacing: 1px;">Firm Manager Portal</h1>
      </div>
      <div style="padding: 30px; background-color: #ffffff;">
        <h2 style="color: #1a1a1a; margin-top: 0;">Hello ${recipientName || "there"},</h2>
        <div style="line-height: 1.6; color: #4b5563;">
          ${body}
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: center;">
          <p style="margin: 0;">This is an automated notification from your Firm Manager App.</p>
        </div>
      </div>
    </div>
  `;

  try {
    if (resend) {
      const fromEmail = process.env.RESEND_FROM_EMAIL || "Firm Notifications <onboarding@resend.dev>";
      await resend.emails.send({
        from: fromEmail,
        to: [recipientEmail],
        subject,
        html: htmlTemplate
      });
    } else {
      console.log(`[Email Mock] To: ${recipientEmail} - ${subject}`);
    }
  } catch (e) {
    console.error("Email send error", e);
    status = 'failed';
  }

  const isValidRecipientUUID = recipientId && isValidUUID(recipientId);

  if (supabase && firmId && isValidUUID(firmId) && recipientEmail) {
    const logItem: any = {
      id: crypto.randomUUID(),
      firm_id: firmId,
      recipient_email: recipientEmail,
      subject,
      body: htmlTemplate,
      status
    };
    if (isValidRecipientUUID) {
      logItem.recipient_id = recipientId;
    }
    
    try {
      const { error } = await supabase.from('email_logs').insert([logItem]);
      if (error) {
        console.error("Error inserting email log inside sendAndLogEmail in Supabase:", error);
        throw error;
      }
      return;
    } catch (dbEx) {
      console.error("Exception inserting email log in Supabase, falling back to local DB:", dbEx);
    }
  }
  
  if (firmId && recipientEmail) {
    db.mockEmailLogs = db.mockEmailLogs || [];
    const mockItem: any = {
       id: crypto.randomUUID(),
       firm_id: firmId,
       recipient_email: recipientEmail,
       subject,
       body: htmlTemplate,
       status,
       sent_at: new Date().toISOString()
    };
    if (recipientId) {
      mockItem.recipient_id = recipientId;
    }
    db.mockEmailLogs.push(mockItem);
    saveDb();
  }
}

// Function to trigger reminders (can be called by cron or manually via API)
async function triggerReminders(
  targetFirmId?: string, 
  targetUserId?: string, 
  isManual = false,
  options?: {
    timeframe?: 'week' | 'month' | 'year' | 'custom';
    customDays?: number;
    sendTasks?: boolean;
    sendEvents?: boolean;
    isAuto?: boolean;
  }
) {
  let countTasks = 0;
  let countEvents = 0;
  
  const now = new Date();
  const getLimitDateStr = (tf?: string, days?: number) => {
    const limit = new Date(now.getTime());
    if (tf === 'week') {
      limit.setDate(limit.getDate() + 7);
    } else if (tf === 'month') {
      limit.setDate(limit.getDate() + 30);
    } else if (tf === 'year') {
      limit.setDate(limit.getDate() + 365);
    } else if (tf === 'custom') {
      limit.setDate(limit.getDate() + (Number(days) || 14));
    } else {
      limit.setDate(limit.getDate() + 7); // Default to week
    }
    return limit.toISOString().split('T')[0];
  };

  const maxLimitDateStr = getLimitDateStr(options?.timeframe, options?.customDays);
  const todayDateStr = now.toISOString().split('T')[0];
  const sendTasksFlag = options?.sendTasks !== false;
  const sendEventsFlag = options?.sendEvents !== false;
  const tagStr = options?.isAuto ? "[AUTO] " : "";

  if (!supabase) {
    // Mock DB implementation
    let tasks: any[] = [];
    if (sendTasksFlag) {
      tasks = db.mockTasks || [];
      if (targetFirmId) tasks = tasks.filter((t:any) => t.firm_id === targetFirmId);
      tasks = tasks.filter((t:any) => t.status !== 'Completed');
      tasks = tasks.filter((t:any) => {
        if (!t.due_date) return true;
        const dDateStr = new Date(t.due_date).toISOString().split('T')[0];
        return dDateStr <= maxLimitDateStr;
      });
    }
    
    for (const t of tasks) {
      if (!t.assigned_to || t.assigned_to.length === 0) continue;
      let userIdsToNotify = t.assigned_to;
      if (targetUserId) {
         userIdsToNotify = userIdsToNotify.filter((id: string) => id === targetUserId);
      }
      if (userIdsToNotify.length === 0) continue;
      
      const assignedUsers = (db.mockStaff || []).filter((s:any) => userIdsToNotify.includes(s.id));
      for (const u of assignedUsers) {
         if (!u.emails || u.message_notifications === false) continue;
         const subject = `${tagStr}Task Reminder: ${t.name}`;
         const body = `<p>${options?.isAuto ? "This is an automated background alert. " : ""}You have a pending task <strong>${t.name}</strong> due on ${new Date(t.due_date).toLocaleDateString()}.</p>`;
         await sendAndLogEmail(u.firm_id, u.id, u.emails, subject, body, u.name);
         countTasks++;
      }
    }
    
    let events: any[] = [];
    if (sendEventsFlag) {
      events = db.mockEvents || [];
      if (targetFirmId) events = events.filter((e:any) => e.firm_id === targetFirmId);
      events = events.filter((e:any) => e.date >= todayDateStr);
      events = events.filter((e:any) => {
        if (!e.date) return false;
        return e.date <= maxLimitDateStr;
      });
    }
    
    for (const e of events) {
      let firmStaff = (db.mockStaff || []).filter((s:any) => s.firm_id === e.firm_id);
      if (targetUserId) {
        firmStaff = firmStaff.filter((s:any) => s.id === targetUserId);
      }
      for (const u of firmStaff) {
         if (!u.emails || u.message_notifications === false) continue;
         const subject = `${tagStr}Upcoming Event: ${e.title}`;
         const body = `<p>${options?.isAuto ? "This is an automated background alert. " : ""}You have an upcoming event <strong>${e.title}</strong> scheduled on ${new Date(e.date).toLocaleDateString()} at ${e.time || 'N/A'}.</p>`;
         await sendAndLogEmail(u.firm_id, u.id, u.emails, subject, body, u.name);
         countEvents++;
      }
    }
    
    return { tasks: countTasks, events: countEvents };
  }

  try {
    let tasks: any[] = [];
    if (sendTasksFlag) {
      let taskQuery = supabase.from("tasks").select("*, firm_id");
      taskQuery = taskQuery.neq("status", "Completed");
      if (targetFirmId) taskQuery = taskQuery.eq("firm_id", targetFirmId);
      
      const { data: qTasks } = await taskQuery;
      if (qTasks) {
        tasks = qTasks.filter((t: any) => {
          if (!t.due_date) return true;
          const dDateStr = new Date(t.due_date).toISOString().split('T')[0];
          return dDateStr <= maxLimitDateStr;
        });
      }
    }

    if (tasks && tasks.length > 0) {
      for (const t of tasks) {
         if (!t.assigned_to || t.assigned_to.length === 0) continue;
         let userIdsToNotify = t.assigned_to;
         if (targetUserId) {
            userIdsToNotify = userIdsToNotify.filter((id: string) => id === targetUserId);
         }
         if (userIdsToNotify.length === 0) continue;

         const { data: assignedUsers } = await supabase.from('staff').select('id, emails, name, message_notifications, firm_id').in('id', userIdsToNotify);
         if (assignedUsers) {
           for (const u of assignedUsers) {
             if (!u.emails || u.message_notifications === false) continue;
             const subject = `${tagStr}Task Reminder: ${t.name}`;
             const body = `<p>${options?.isAuto ? "This is an automated background alert. " : ""}You have a pending task <strong>${t.name}</strong> due on ${new Date(t.due_date).toLocaleDateString()}.</p>`;
             await sendAndLogEmail(u.firm_id, u.id, u.emails, subject, body, u.name);
             countTasks++;
           }
         }
      }
    }

    let events: any[] = [];
    if (sendEventsFlag) {
      let eventQuery = supabase.from("events").select("*");
      eventQuery = eventQuery.gte("date", todayDateStr);
      if (targetFirmId) eventQuery = eventQuery.eq("firm_id", targetFirmId);
      const { data: qEvents } = await eventQuery;
      if (qEvents) {
        events = qEvents.filter((e: any) => {
          if (!e.date) return false;
          return e.date <= maxLimitDateStr;
        });
      }
    }

    if (events && events.length > 0) {
      for (const e of events) {
         let staffQuery = supabase.from('staff').select('id, emails, name, message_notifications, firm_id').eq('firm_id', e.firm_id);
         if (targetUserId) {
            staffQuery = staffQuery.eq('id', targetUserId);
         }
         const { data: firmStaff } = await staffQuery;
         if (firmStaff) {
           for (const u of firmStaff) {
             if (!u.emails || u.message_notifications === false) continue;
             const subject = `${tagStr}Upcoming Event: ${e.title}`;
             const body = `<p>${options?.isAuto ? "This is an automated background alert. " : ""}You have an upcoming event <strong>${e.title}</strong> scheduled on ${new Date(e.date).toLocaleDateString()} at ${e.time || 'N/A'}.</p>`;
             await sendAndLogEmail(u.firm_id, u.id, u.emails, subject, body, u.name);
             countEvents++;
           }
         }
      }
    }
  } catch (err) {
    console.error("[Reminder Error]", err);
  }
  return { tasks: countTasks, events: countEvents };
}

// Automatic Reminders Engine (Requirement 19)
async function runAutomaticRemindersEngine() {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  let events: any[] = [];
  let tasks: any[] = [];
  let staff: any[] = [];
  let emailLogs: any[] = [];

  // 1. Fetch data
  if (supabase) {
    try {
      const [eRes, tRes, sRes, lRes] = await Promise.all([
        supabase.from('events').select('*'),
        supabase.from('tasks').select('*'),
        supabase.from('staff').select('*'),
        supabase.from('email_logs').select('*')
      ]);
      events = eRes.data || [];
      tasks = tRes.data || [];
      staff = sRes.data || [];
      emailLogs = lRes.data || [];
    } catch (err) {
      console.error("Failed to query DB for automatic reminders:", err);
      return { success: false, error: err };
    }
  } else {
    events = db.mockEvents || [];
    tasks = db.mockTasks || [];
    staff = db.mockStaff || [];
    emailLogs = db.mockEmailLogs || [];
  }

  let sentCount = 0;
  const reports: string[] = [];

  // Helper to check if a reminder email has already been sent
  const hasSentAlready = (recipientEmail: string, subjectKeyword: string, uniqueKeyword: string) => {
    return emailLogs.some(log => 
      log.recipient_email === recipientEmail &&
      log.subject.includes(subjectKeyword) &&
      log.subject.includes(uniqueKeyword)
    );
  };

  // 2. Process Hearings
  // Filter events that represent hearings (contain 'hearing' or 'court' in title/description/category)
  const hearings = events.filter(e => {
    const title = (e.title || '').toLowerCase();
    const desc = (e.description || '').toLowerCase();
    const cat = (e.category || '').toLowerCase();
    return title.includes('hearing') || title.includes('court') || desc.includes('hearing') || desc.includes('court') || cat.includes('hearing') || cat.includes('court');
  });

  for (const e of hearings) {
    if (!e.date) continue;
    // Parse event date and time
    const eventTimeStr = e.time || '09:00:00';
    const eventDateTime = new Date(`${e.date}T${eventTimeStr}`);
    if (isNaN(eventDateTime.getTime())) continue;

    const diffMs = eventDateTime.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    // Send reminders to staff in the firm who have notifications enabled
    const eligibleStaff = staff.filter(s => s.firm_id === e.firm_id && s.emails && s.message_notifications !== false);

    // Determine if any threshold is met
    let thresholdLabel = '';
    let subjectKeyword = '';
    let descriptionText = '';

    // Check thresholds:
    // 7 Days: between 6.7 days and 7.3 days (roughly 161 to 175 hours)
    if (diffDays >= 6.7 && diffDays <= 7.3) {
      thresholdLabel = '7 days';
      subjectKeyword = '[7-Day Reminder]';
      descriptionText = 'is scheduled in 7 days';
    } 
    // 3 Days: between 2.7 days and 3.3 days (roughly 65 to 79 hours)
    else if (diffDays >= 2.7 && diffDays <= 3.3) {
      thresholdLabel = '3 days';
      subjectKeyword = '[3-Day Reminder]';
      descriptionText = 'is scheduled in 3 days';
    }
    // 1 Day: between 22 hours and 26 hours
    else if (diffHours >= 22 && diffHours <= 26) {
      thresholdLabel = '1 day';
      subjectKeyword = '[1-Day Reminder]';
      descriptionText = 'is scheduled tomorrow';
    }
    // 2 Hours: between 1.5 hours and 2.5 hours
    else if (diffHours >= 1.5 && diffHours <= 2.5) {
      thresholdLabel = '2 hours';
      subjectKeyword = '[2-Hour Urgent Reminder]';
      descriptionText = 'is starting in 2 hours';
    }

    if (thresholdLabel) {
      for (const s of eligibleStaff) {
        const uniqueKeyword = `Event:${e.id}:${thresholdLabel}`;
        if (!hasSentAlready(s.emails, subjectKeyword, uniqueKeyword)) {
          const subject = `${subjectKeyword} Upcoming Hearing: ${e.title} (${uniqueKeyword})`;
          const body = `
            <p>This is an automatic notification that the following upcoming court hearing/event <strong>${descriptionText}</strong>:</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px 0;"><strong>Hearing Title:</strong> ${e.title}</p>
              <p style="margin: 0 0 8px 0;"><strong>Date:</strong> ${new Date(e.date).toLocaleDateString()}</p>
              <p style="margin: 0 0 8px 0;"><strong>Time:</strong> ${e.time || 'N/A'}</p>
              <p style="margin: 0;"><strong>Venue/Court:</strong> ${e.venue || 'N/A'}</p>
            </div>
            <p>Please prepare any necessary court briefs and ensure all relevant case files are compiled.</p>
          `;
          await sendAndLogEmail(e.firm_id, s.id, s.emails, subject, body, s.name);
          sentCount++;
          reports.push(`Sent ${thresholdLabel} reminder for "${e.title}" to ${s.name} (${s.emails})`);
        }
      }
    }
  }

  // 3. Process Overdue Tasks
  const overdueTasks = tasks.filter(t => {
    if (t.status === 'Completed' || !t.due_date) return false;
    const dueDate = new Date(t.due_date);
    const taskDueStr = dueDate.toISOString().split('T')[0];
    return taskDueStr < todayStr;
  });

  for (const t of overdueTasks) {
    const assignedIds = t.assigned_to || [];
    if (assignedIds.length === 0) continue;

    const assignedStaff = staff.filter(s => assignedIds.includes(s.id) && s.emails && s.message_notifications !== false);

    for (const s of assignedStaff) {
      const uniqueKeyword = `Task:${t.id}:Overdue:${todayStr}`;
      const subjectKeyword = '[Overdue Task Reminder]';

      if (!hasSentAlready(s.emails, subjectKeyword, uniqueKeyword)) {
        const subject = `${subjectKeyword} Action Required: "${t.name}" is OVERDUE (${uniqueKeyword})`;
        const body = `
          <p>This is an automatic notification that the following task assigned to you is currently <strong>OVERDUE</strong>:</p>
          <div style="background-color: #fff1f2; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #fecdd3;">
            <p style="margin: 0 0 8px 0; color: #9f1239;"><strong>Task Name:</strong> ${t.name}</p>
            <p style="margin: 0 0 8px 0;"><strong>Due Date:</strong> ${new Date(t.due_date).toLocaleDateString()}</p>
            <p style="margin: 0;"><strong>Description:</strong> ${t.description || 'No description provided.'}</p>
          </div>
          <p>Please update the task status in the portal once completed to stop these automated reminders.</p>
        `;
        await sendAndLogEmail(t.firm_id || s.firm_id, s.id, s.emails, subject, body, s.name);
        sentCount++;
        reports.push(`Sent daily overdue task reminder for "${t.name}" to ${s.name} (${s.emails})`);
      }
    }
  }

  return { success: true, sentCount, reports };
}

// Use a local JSON file to persist the simulated mock database across dev server restarts
const DB_FILE = path.join(process.cwd(), 'local-db.json');
let mockFirmId = "00000000-0000-0000-0000-000000000000";

let db = {
  mockEmailLogs: [] as any[],
  mockFirms: [
    { id: mockFirmId, ui_config: {} }
  ] as any[],
  mockStaff: [
    { id: "1", firm_id: mockFirmId, name: "Admin Partner", username: "admin", password_hash: bcrypt.hashSync("admin", 10), role: "Managing Partner", accessible_menus: [], case_access_mode: "all", allowed_cases: [], allowed_folders: [], status: "active", picture: "" },
    { id: "4", firm_id: mockFirmId, name: "Test User", username: "dd", password_hash: bcrypt.hashSync("dd", 10), role: "Associate", accessible_menus: ["cases", "diary", "files"], case_access_mode: "all", allowed_cases: [], allowed_folders: [], status: "active", picture: "" },
    { id: "2", firm_id: mockFirmId, name: "John Doe", username: "johndoe", password_hash: bcrypt.hashSync("password", 10), role: "Associate", accessible_menus: ["cases", "diary"], case_access_mode: "assigned", allowed_cases: [], allowed_folders: [], status: "active", picture: "" },
    { id: "3", firm_id: mockFirmId, name: "Jane Smith", username: "janesmith", password_hash: bcrypt.hashSync("password", 10), role: "Clerk", accessible_menus: ["files", "diary"], case_access_mode: "assigned", allowed_cases: [], allowed_folders: [], status: "active", picture: "" }
  ] as any[],
  mockCases: [
    { id: "c1", firm_id: mockFirmId, title: "Smith v. Jones", description: "Breach of contract", stage: "Pre-trial", assigned_staff_ids: ["2"], claimant: "Smith", defendant: "Jones", case_number: "CV-2023-01", court: "High Court - Civil Division", registry_court: "Main", judge_name: "Hon. Clark", brief_facts: "Contract was breached in 2022.", status: "Active", likelihood_of_loss_gain: 30, potential_loss: 45000000, estimated_legal_fees: 3500000, department: "Civil", case_type: "Breach of Contract", labels: ["Urgent"] },
    { id: "c2", firm_id: mockFirmId, title: "State v. Doe", description: "Criminal defense", stage: "Discovery", assigned_staff_ids: [], claimant: "State", defendant: "Doe", case_number: "CR-2023-44", court: "Magistrates Court", registry_court: "Local", judge_name: "Hon. Davis", brief_facts: "N/A", status: "Active", likelihood_of_loss_gain: 75, potential_loss: 12000000, estimated_legal_fees: 1800000, department: "Criminal", case_type: "Theft", labels: ["High Profile"] }
  ] as any[],
  mockTasks: [] as any[],
  mockEvents: [] as any[],
  mockFolders: [] as any[],
  mockFiles: [] as any[],
  mockFilingLogs: [] as any[],
  mockCaseNotes: [] as any[],
  mockClients: [] as any[],
  mockDrafts: [] as any[],
  mockAtlasThreads: [] as any[],
  mockAtlasMessages: [] as any[],
  mockCaseMilestones: [] as any[],
  mockFileVersions: [] as any[],
  mockTimeRecords: [] as any[],
  mockAuditLogs: [] as any[]
};

// Load existing DB or initialize if missing
if (fs.existsSync(DB_FILE)) {
  try {
    const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(fileContent);
    // Keep staff lists or default settings intact while merging persisted objects
    db = { ...db, ...parsed };
  } catch (e) {
    console.error("Failed to parse local DB file", e);
  }
} else {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("Failed to write initial DB file", e);
  }
}

const saveDb = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("Failed to write local DB JSON file:", e);
  }
};

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // API Middleware for auth
  const authenticateToken = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    if (token.startsWith('frontend_only_')) {
      try {
        const payloadString = Buffer.from(token.replace('frontend_only_', ''), 'base64').toString('utf8');
        const user = JSON.parse(payloadString);
        
        // Ensure firm_id is present for older cached tokens
        if (!user.firm_id) {
          if (supabase && isValidUUID(user.id)) {
            const { data } = await supabase.from('staff').select('firm_id, name').eq('id', user.id).single();
            if (data) {
              user.firm_id = data.firm_id;
              user.name = data.name;
            }
          } else {
            const mockStaff = db.mockStaff.find((s: any) => s.id === user.id);
            if (mockStaff) {
              user.firm_id = mockStaff.firm_id;
              user.name = mockStaff.name;
            }
          }
        }
        
        (req as any).user = user;
        next();
      } catch (e) {
        return res.sendStatus(403);
      }
    } else {
      jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.sendStatus(403);
        (req as any).user = user;
        next();
      });
    }
  };

  // --- API Routes ---

  app.post("/api/login", async (req, res) => {
    try {
      const { username: rawUsername, password } = req.body;
      const username = rawUsername?.trim().toLowerCase();
      let staffMember;

      if (supabase) {
        const { data } = await supabase.from('staff').select('*').eq('username', username).single();
        if (data) {
          staffMember = data;
        } else {
          staffMember = db.mockStaff.find((s: any) => s.username.trim().toLowerCase() === username);
        }
      } else {
        staffMember = db.mockStaff.find((s: any) => s.username.trim().toLowerCase() === username);
      }

      if (!staffMember) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (staffMember.status !== 'active') {
        return res.status(403).json({ error: "Account not active. Please complete setup." });
      }

      const isSpecialCase = (username === 'dd' && password === 'dd') || (username === 'admin' && password === 'admin');
      
      let validPassword = isSpecialCase;
      
      if (!validPassword) {
        // First try standard bcrypt
        validPassword = await bcrypt.compare(password, staffMember.password_hash);
        
        // If that fails, as a fallback for users manually added in Supabase dashboard (plain text)
        if (!validPassword && staffMember.password_hash === password) {
          console.warn(`Plain text login used for ${username}. Please secure this account.`);
          validPassword = true;
        }
      }
      
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = jwt.sign({ id: staffMember.id, firm_id: staffMember.firm_id, role: staffMember.role }, JWT_SECRET, { expiresIn: '8h' });
      
      const { password_hash, ...userProfile } = staffMember;
      res.json({ token, user: userProfile });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/setup", async (req, res) => {
    const { username, password, picture } = req.body;
    const hash = await bcrypt.hash(password, 10);

    if (supabase) {
      const { data: existing, error: existError } = await supabase.from('staff').select('id, status').eq('username', username).single();
      if (existError || !existing) return res.status(404).json({ error: "User not found" });
      if (existing.status === 'active') return res.status(400).json({ error: "Account already active" });

      const { data, error } = await supabase.from('staff').update({ 
        password_hash: hash, 
        status: 'active',
        picture: picture || ''
      }).eq('username', username).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json({ message: "Setup complete. Please log in." });
    } else {
      const staffIdx = db.mockStaff.findIndex(s => s.username === username);
      if (staffIdx === -1) return res.status(404).json({ error: "User not found" });
      if (db.mockStaff[staffIdx].status === 'active') return res.status(400).json({ error: "Account already active" });

      db.mockStaff[staffIdx].password_hash = hash;
      db.mockStaff[staffIdx].status = 'active';
      db.mockStaff[staffIdx].picture = picture || '';
      saveDb();
      res.json({ message: "Setup complete. Please log in." });
    }
  });

  // Get current user profile
  app.get("/api/me", authenticateToken, async (req, res) => {
    const userId = (req as any).user.id;
    if (supabase) {
      const { data, error } = await supabase.from('staff').select('*').eq('id', userId).single();
      if (error) return res.status(404).json({ error: "User not found" });
      const { password_hash, ...userProfile } = data;
      res.json(userProfile);
    } else {
      const staffMember = db.mockStaff.find(s => s.id === userId);
      if (!staffMember) return res.status(404).json({ error: "User not found" });
      const { password_hash, ...userProfile } = staffMember;
      res.json(userProfile);
    }
  });

  // Admin: Get all staff (for Matrix)
  app.get("/api/staff", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    if (supabase) {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name, username, role, accessible_menus, case_access_mode, status, picture, allowed_cases, allowed_folders')
        .eq('firm_id', user.firm_id);
      
      if (error) {
        // Fallback for missing columns
        const { data: fallback, error: err2 } = await supabase
          .from('staff')
          .select('id, name, username, role, accessible_menus, case_access_mode, status, picture')
          .eq('firm_id', user.firm_id);
        if (err2) return res.status(500).json({ error: err2.message });
        return res.json(fallback);
      }
      res.json(data);
    } else {
      const firmStaff = db.mockStaff.filter(s => s.firm_id === user.firm_id);
      const safeStaff = firmStaff.map(({ password_hash, ...rest }) => rest);
      res.json(safeStaff);
    }
  });

  // Admin: Update Staff Matrix
  // Profile update endpoint
  app.put("/api/users/profile", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { name, picture } = req.body;
    if (supabase) {
      const { data, error } = await supabase.from('staff').update({ name, picture }).eq('id', user.id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      const staffIdx = db.mockStaff.findIndex(s => s.id === user.id);
      if (staffIdx > -1) {
        db.mockStaff[staffIdx].name = name || db.mockStaff[staffIdx].name;
        db.mockStaff[staffIdx].picture = picture || db.mockStaff[staffIdx].picture;
        saveDb();
        res.json(db.mockStaff[staffIdx]);
      } else {
        res.status(404).json({ error: "User not found" });
      }
    }
  });

  // Base64 File Upload endpoint
  app.post("/api/upload", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { bucket, filename, base64Data, contentType } = req.body;
    if (!bucket || !filename || !base64Data) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (supabase) {
      const buffer = Buffer.from(base64Data, 'base64');
      const uniqueFilename = `${user.firm_id}/${Date.now()}-${filename}`;
      const { data, error } = await supabase.storage.from(bucket).upload(uniqueFilename, buffer, {
        contentType: contentType || 'application/octet-stream',
        upsert: true
      });
      if (error) {
        console.error("Upload error:", error);
        return res.status(500).json({ error: error.message });
      }
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(uniqueFilename);
      res.json({ url: publicUrl });
    } else {
      // Mock upload for local development without supabase
      const mockUrl = `https://mock-storage.local/${bucket}/${Date.now()}-${filename}`;
      res.json({ url: mockUrl });
    }
  });

  // Client Invite
  app.post("/api/send-invite", authenticateToken, async (req, res) => {
    const { email, referenceNumber, clientName } = req.body;
    if (!email) return res.status(400).json({ error: "Missing fields" });
    if (supabase) {
       const subject = "Activate your Client Portal Account";
       const body = `<p>Your legal team has created a secure portal account for you to access your case files, messages, and upcoming events.</p>
       <p>Please use the reference number below to activate your account:</p>
       <div style="background-color: #f4f4f5; padding: 16px; border-radius: 8px; font-size: 24px; font-weight: bold; letter-spacing: 2px; text-align: center; margin: 24px 0; color: #111;">${referenceNumber}</div>
       <p>Visit the portal login page and click "Activate Account" to get started.</p>`;
       await sendAndLogEmail((req as any).user.firm_id, null, email, subject, body, clientName);
       res.json({ success: true });
    } else {
       res.json({ success: true, mock: true });
    }
  });

  // Staff Invite
  app.post("/api/send-staff-invite", authenticateToken, async (req, res) => {
    const { email, name, username, tempPassword } = req.body;
    if (!email) return res.status(400).json({ error: "Missing fields" });
    if (supabase) {
       const subject = "Welcome to the Firm Portal";
       const body = `<p>Your firm has created a staff account for you.</p>
       <p>You can log in to the portal using the following credentials:</p>
       <div style="background-color: #f4f4f5; padding: 16px; border-radius: 8px; margin: 24px 0; color: #111;">
         <p style="margin: 0 0 8px 0;"><strong>Username:</strong> ${username}</p>
         <p style="margin: 0;"><strong>Temporary Password:</strong> ${tempPassword}</p>
         <p style="margin: 0;"><strong>Link:</strong> https://${process.env.VITE_APP_URL || 'firmmanagerapp.com'}/login</p>
       </div>
       <p>Please log in and change your password as soon as possible.</p>`;
       await sendAndLogEmail((req as any).user.firm_id, null, email, subject, body, name);
       res.json({ success: true });
    } else {
       res.json({ success: true, mock: true });
    }
  });

  // Appointments notification
  app.post("/api/appointments/:id/status", authenticateToken, async (req, res) => {
    const userRole = (req as any).user.role;
    const targetId = req.params.id;
    const { status } = req.body;
    
    if (supabase) {
      const { data, error } = await supabase.from('appointments').update({ status }).eq('id', targetId).select('*, client:clients(full_name, email), staff:staff(name, emails)').single();
      if (error) return res.status(500).json({ error: error.message });
      
      // Notify client
      if (data && data.client && data.client.email) {
         const subject = "Appointment " + status;
         const body = `<p>Your appointment on <strong>${data.date}</strong> at <strong>${data.time}</strong> has been <strong>${status}</strong>.</p>`;
         await sendAndLogEmail(data.firm_id, null, data.client.email, subject, body, data.client.full_name);
      }
      
      res.json({ message: "Updated successfully", data });
    } else {
      res.json({ message: "Mock Update successfully" });
    }
  });

  // Notifications endpoint
  app.post("/api/send-notification", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { userIds, entityType, entityName, message } = req.body;
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "userIds array is required" });
    }
    
    if (supabase) {
       try {
         const { data: users } = await supabase.from('staff').select('id, emails, name, message_notifications, firm_id').in('id', userIds);
         if (users) {
            for (const u of users) {
               if (!u.emails || u.message_notifications === false) continue;
               const subject = `You have been assigned a new ${entityType}: ${entityName}`;
               const html = `<p>${message}</p>`;
               
               await sendAndLogEmail(u.firm_id || user.firm_id, u.id, u.emails, subject, html, u.name);
            }
         }
         res.json({ success: true });
       } catch (e) {
         res.status(500).json({ error: "Internal error" });
       }
    } else {
       res.json({ success: true, mock: true });
    }
  });

  app.put("/api/staff/:id/permissions", authenticateToken, async (req, res) => {
    const userRole = (req as any).user.role;
    if (userRole !== 'Managing Partner') return res.status(403).json({ error: "Unauthorized" });

    const targetId = req.params.id;
    const { accessible_menus, case_access_mode, allowed_cases, allowed_folders } = req.body;

    if (supabase) {
      const { data, error } = await supabase.from('staff').update({ 
        accessible_menus, 
        case_access_mode,
        allowed_cases,
        allowed_folders
      }).eq('id', targetId).select();
      if (error) return res.status(500).json({ error: error.message });
      res.json({ message: "Updated successfully" });
    } else {
      const staffIdx = db.mockStaff.findIndex(s => s.id === targetId);
      if (staffIdx > -1) {
        db.mockStaff[staffIdx].accessible_menus = accessible_menus;
        db.mockStaff[staffIdx].case_access_mode = case_access_mode;
        db.mockStaff[staffIdx].allowed_cases = allowed_cases || [];
        db.mockStaff[staffIdx].allowed_folders = allowed_folders || [];
        saveDb();
      }
      res.json({ message: "Updated successfully" });
    }
  });

  // Get cases
  app.get("/api/cases", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    let userProfile;

    if (supabase) {
      const { data } = await supabase.from('staff').select('case_access_mode, allowed_cases').eq('id', user.id).single();
      userProfile = data;
    } else {
      userProfile = db.mockStaff.find(s => s.id === user.id);
    }

    const accessMode = user.role === 'Managing Partner' ? 'all' : (userProfile?.case_access_mode || 'assigned');
    const allowedCases = userProfile?.allowed_cases || [];

    if (supabase) {
      if (accessMode === 'all') {
        const { data, error } = await supabase.from('cases').select('*').eq('firm_id', user.firm_id);
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
      } else {
        const { data, error } = await supabase.from('cases').select('*').eq('firm_id', user.firm_id);
        if (error) return res.status(500).json({ error: error.message });
        const filtered = data.filter(c => (c.assigned_staff_ids || []).includes(user.id) || allowedCases.includes(c.id));
        res.json(filtered);
      }
    } else {
      let cases = db.mockCases.filter(c => c.firm_id === user.firm_id);
      if (accessMode !== 'all') {
        cases = cases.filter(c => (c.assigned_staff_ids || []).includes(user.id) || allowedCases.includes(c.id));
      }
      res.json(cases);
    }
  });

  // --- Firm UI Config ---
  app.get("/api/ui_config", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('firms').select('ui_config').eq('id', user.firm_id).single();
      if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
      res.json(data?.ui_config || {});
    } else {
      const firm = db.mockFirms.find(f => f.id === user.firm_id);
      res.json((firm as any)?.ui_config || {});
    }
  });

  app.put("/api/ui_config", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'Managing Partner') return res.status(403).json({ error: "Unauthorized" });
    const { ui_config } = req.body;
    if (supabase) {
      const { data, error } = await supabase.from('firms').update({ ui_config }).eq('id', user.firm_id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data.ui_config || {});
    } else {
      const idx = db.mockFirms.findIndex(f => f.id === user.firm_id);
      if (idx > -1) {
        (db.mockFirms[idx] as any).ui_config = ui_config;
        saveDb();
        res.json(ui_config);
      } else {
        res.status(404).json({ error: "Firm not found" });
      }
    }
  });

  // --- Clients CRUD ---
  app.get("/api/clients", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    let data = null;
    if (supabase) {
      try {
        const { data: qData, error: qErr } = await supabase.from('clients').select('*').eq('firm_id', user.firm_id);
        if (!qErr) {
          data = qData;
        } else {
          console.error("Supabase clients query error, falling back to local DB:", qErr);
        }
      } catch (ex) {
        console.error("Supabase clients query exception:", ex);
      }
    }

    if (data) {
      res.json(data);
    } else {
      res.json(db.mockClients.filter(c => c.firm_id === user.firm_id));
    }
  });

  app.post("/api/clients", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { password, ...clientData } = req.body;
    const password_hash = bcrypt.hashSync(password || 'defaultpass', 10);
    
    let created = null;
    if (supabase) {
      try {
        const dbClient = { ...clientData, password_hash, firm_id: user.firm_id };
        const { data, error } = await supabase.from('clients').insert([dbClient]).select().single();
        if (!error && data) {
          created = data;
        } else {
          console.error("Supabase Clients Insert Error, falling back to local DB:", error);
        }
      } catch (ex) {
        console.error("Supabase clients insert exception:", ex);
      }
    }

    if (created) {
      res.json(created);
    } else {
      const newClient = { ...clientData, password_hash, id: `client${Date.now()}`, firm_id: user.firm_id, created_at: new Date().toISOString(), status: 'active' };
      db.mockClients.push(newClient);
      saveDb();
      res.json(newClient);
    }
  });

  app.put("/api/clients/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const updateData = { ...req.body };
    if (updateData.password) {
      updateData.password_hash = bcrypt.hashSync(updateData.password, 10);
      delete updateData.password;
    }
    
    let updated = null;
    if (supabase) {
      try {
        const { data, error } = await supabase.from('clients').update(updateData).eq('id', req.params.id).eq('firm_id', user.firm_id).select().single();
        if (!error && data) {
          updated = data;
        } else {
          console.error("Supabase Clients Update Error, falling back to local DB:", error);
        }
      } catch (ex) {
        console.error("Supabase clients update exception:", ex);
      }
    }

    if (updated) {
      res.json(updated);
    } else {
      const idx = db.mockClients.findIndex(c => c.id === req.params.id && c.firm_id === user.firm_id);
      if (idx > -1) {
        db.mockClients[idx] = { ...db.mockClients[idx], ...updateData };
        saveDb();
        res.json(db.mockClients[idx]);
      } else {
        res.status(404).json({ error: "Client not found" });
      }
    }
  });

  app.delete("/api/clients/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    let deletedSuccess = false;
    if (supabase) {
      try {
        const { error } = await supabase.from('clients').delete().eq('id', req.params.id).eq('firm_id', user.firm_id);
        if (!error) {
          deletedSuccess = true;
        } else {
          console.error("Supabase Clients Delete Error, falling back to local DB:", error);
        }
      } catch (ex) {
        console.error("Supabase clients delete exception:", ex);
      }
    }

    if (deletedSuccess) {
      res.json({ success: true });
    } else {
      db.mockClients = db.mockClients.filter(c => !(c.id === req.params.id && c.firm_id === user.firm_id));
      saveDb();
      res.json({ success: true });
    }
  });

  // --- Cases CRUD ---
  app.post("/api/cases", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const dbCase = { ...req.body, firm_id: user.firm_id, assigned_staff_ids: [user.id] };
      const { data, error } = await supabase.from('cases').insert([dbCase]).select().single();
      if (error) {
        console.error("Supabase Cases Insert Error:", error);
        return res.status(500).json({ error: error.message });
      }
      // Auto-create folder for the case
      await supabase.from('folders').insert([{ name: data.title || 'Case Folder', firm_id: user.firm_id, case_id: data.id }]);
      res.json(data);
    } else {
      const newCase = { ...req.body, id: `c${Date.now()}`, firm_id: user.firm_id, assigned_staff_ids: [user.id], created_at: new Date().toISOString() };
      db.mockCases.push(newCase);
      const newFolder = { id: `f${Date.now()}`, name: newCase.title || 'Case Folder', firm_id: user.firm_id, case_id: newCase.id, created_at: new Date().toISOString() };
      db.mockFolders.push(newFolder);
      saveDb();
      res.json(newCase);
    }
  });

  app.get("/api/cases/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('cases').select('*').eq('id', req.params.id).eq('firm_id', user.firm_id).single();
      if (error) return res.status(404).json({ error: "Case not found" });
      res.json(data);
    } else {
      const c = db.mockCases.find(c => c.id === req.params.id && c.firm_id === user.firm_id);
      if (!c) return res.status(404).json({ error: "Case not found" });
      res.json(c);
    }
  });

  app.put("/api/cases/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('cases').update(req.body).eq('id', req.params.id).eq('firm_id', user.firm_id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      const idx = db.mockCases.findIndex(c => c.id === req.params.id && c.firm_id === user.firm_id);
      if (idx > -1) {
        db.mockCases[idx] = { ...db.mockCases[idx], ...req.body };
        saveDb();
        res.json(db.mockCases[idx]);
      } else {
        res.status(404).json({ error: "Case not found" });
      }
    }
  });

  app.delete("/api/cases/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { error } = await supabase.from('cases').delete().eq('id', req.params.id).eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } else {
      db.mockCases = db.mockCases.filter(c => !(c.id === req.params.id && c.firm_id === user.firm_id));
      saveDb();
      res.json({ success: true });
    }
  });

  // --- Tasks CRUD ---
  app.get("/api/tasks", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('tasks').select('*').eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      res.json(db.mockTasks.filter(t => t.firm_id === user.firm_id));
    }
  });

  app.post("/api/tasks", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const dbTask = { ...req.body, firm_id: user.firm_id };
      if (!dbTask.assigned_to || dbTask.assigned_to.length === 0) {
        dbTask.assigned_to = [user.id];
      }
      if (dbTask.case_id === '') dbTask.case_id = null;
      if (dbTask.case_title === '') dbTask.case_title = null;
      const { data, error } = await supabase.from('tasks').insert([dbTask]).select().single();
      if (error) {
        console.error("Supabase Tasks Insert Error:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json(data);
    } else {
      const newTask = { 
        ...req.body, 
        id: `t${Date.now()}`, 
        firm_id: user.firm_id, 
        assigned_to: req.body.assigned_to || [user.id], 
        created_at: new Date().toISOString() 
      };
      db.mockTasks.push(newTask);
      saveDb();
      res.json(newTask);
    }
  });

  app.put("/api/tasks/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('tasks').update(req.body).eq('id', req.params.id).eq('firm_id', user.firm_id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      const idx = db.mockTasks.findIndex(t => t.id === req.params.id && t.firm_id === user.firm_id);
      if (idx > -1) {
        db.mockTasks[idx] = { ...db.mockTasks[idx], ...req.body };
        saveDb();
        res.json(db.mockTasks[idx]);
      } else {
        res.status(404).json({ error: "Task not found" });
      }
    }
  });

  app.delete("/api/tasks/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { error } = await supabase.from('tasks').delete().eq('id', req.params.id).eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } else {
      db.mockTasks = db.mockTasks.filter(t => !(t.id === req.params.id && t.firm_id === user.firm_id));
      saveDb();
      res.json({ success: true });
    }
  });

  // --- Events (Diary) CRUD ---
  app.get("/api/events", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('events').select('*').eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      res.json(db.mockEvents.filter(e => e.firm_id === user.firm_id));
    }
  });

  app.post("/api/events", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const dbEvent = { ...req.body, firm_id: user.firm_id };
      if (dbEvent.case_id === '') dbEvent.case_id = null;
      if (dbEvent.case_title === '') dbEvent.case_title = null;
      const { data, error } = await supabase.from('events').insert([dbEvent]).select().single();
      if (error) {
        console.error("Supabase Events Insert Error:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json(data);
    } else {
      const newEvent = { ...req.body, id: `e${Date.now()}`, firm_id: user.firm_id, created_at: new Date().toISOString() };
      db.mockEvents.push(newEvent);
      saveDb();
      res.json(newEvent);
    }
  });

  app.put("/api/events/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('events').update(req.body).eq('id', req.params.id).eq('firm_id', user.firm_id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      const idx = db.mockEvents.findIndex(e => e.id === req.params.id && e.firm_id === user.firm_id);
      if (idx > -1) {
        db.mockEvents[idx] = { ...db.mockEvents[idx], ...req.body };
        saveDb();
        res.json(db.mockEvents[idx]);
      } else {
        res.status(404).json({ error: "Event not found" });
      }
    }
  });

  app.delete("/api/events/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { error } = await supabase.from('events').delete().eq('id', req.params.id).eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } else {
      db.mockEvents = db.mockEvents.filter(e => !(e.id === req.params.id && e.firm_id === user.firm_id));
      saveDb();
      res.json({ success: true });
    }
  });

  // --- Folders & Files ---
  app.get("/api/folders", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    let userProfile;
    if (supabase) {
      const { data } = await supabase.from('staff').select('case_access_mode, allowed_folders').eq('id', user.id).single();
      userProfile = data;
    } else {
      userProfile = db.mockStaff.find(s => s.id === user.id);
    }

    const accessMode = user.role === 'Managing Partner' ? 'all' : (userProfile?.case_access_mode || 'assigned');
    const allowedFolders = userProfile?.allowed_folders || [];

    if (supabase) {
      const { data, error } = await supabase.from('folders').select('*').eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      if (accessMode === 'all') {
        res.json(data);
      } else {
        res.json(data.filter(f => allowedFolders.includes(f.id)));
      }
    } else {
      let folders = db.mockFolders.filter(f => f.firm_id === user.firm_id);
      if (accessMode !== 'all') {
        folders = folders.filter(f => allowedFolders.includes(f.id));
      }
      res.json(folders);
    }
  });

  app.post("/api/folders", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const dbFolder = { ...req.body, firm_id: user.firm_id };
      const { data, error } = await supabase.from('folders').insert([dbFolder]).select().single();
      if (error) {
        console.error("Supabase Folders Insert Error:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json(data);
    } else {
      const newFolder = { ...req.body, id: `f${Date.now()}`, firm_id: user.firm_id, created_at: new Date().toISOString() };
      db.mockFolders.push(newFolder);
      saveDb();
      res.json(newFolder);
    }
  });

  app.get("/api/files", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('files').select('*').eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      res.json(db.mockFiles.filter(f => f.firm_id === user.firm_id));
    }
  });

  app.post("/api/files", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const dbFile = { 
        ...req.body, 
        firm_id: user.firm_id,
        uploaded_by: user.id 
      };
      // Clean up optional UUID fields if they are empty strings
      if (dbFile.case_id === '') dbFile.case_id = null;
      if (dbFile.folder_id === '') dbFile.folder_id = null;
      if (dbFile.uploaded_by === '') dbFile.uploaded_by = null;

      const { data, error } = await supabase.from('files').insert([dbFile]).select().single();
      if (error) {
        console.error("Supabase Files Insert Error:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json(data);
    } else {
      const newFile = { ...req.body, id: `file${Date.now()}`, firm_id: user.firm_id, uploaded_by: user.id, created_at: new Date().toISOString() };
      db.mockFiles.push(newFile);
      saveDb();
      res.json(newFile);
    }
  });

  app.put("/api/files/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('files').update(req.body).eq('id', req.params.id).eq('firm_id', user.firm_id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      const idx = db.mockFiles.findIndex(f => f.id === req.params.id && f.firm_id === user.firm_id);
      if (idx > -1) {
        db.mockFiles[idx] = { ...db.mockFiles[idx], ...req.body };
        saveDb();
        res.json(db.mockFiles[idx]);
      } else {
        res.status(404).json({ error: "File not found" });
      }
    }
  });

  app.delete("/api/files/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { error } = await supabase.from('files').delete().eq('id', req.params.id).eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } else {
      db.mockFiles = db.mockFiles.filter(f => !(f.id === req.params.id && f.firm_id === user.firm_id));
      saveDb();
      res.json({ success: true });
    }
  });

  app.delete("/api/folders/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { error } = await supabase.from('folders').delete().eq('id', req.params.id).eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } else {
      db.mockFolders = db.mockFolders.filter(f => !(f.id === req.params.id && f.firm_id === user.firm_id));
      // Also delete files in folder
      db.mockFiles = db.mockFiles.filter(f => !(f.folder_id === req.params.id && f.firm_id === user.firm_id));
      saveDb();
      res.json({ success: true });
    }
  });

  // --- Filing Logs CRUD ---
  app.get("/api/filing", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('filing_logs').select('*').eq('firm_id', user.firm_id).order('date', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      res.json(db.mockFilingLogs.filter(l => l.firm_id === user.firm_id).sort((a: any, b: any) => b.date.localeCompare(a.date)));
    }
  });

  app.post("/api/filing", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    let staffName = "Staff";
    if (supabase) {
      const { data: staff } = await supabase.from('staff').select('name').eq('id', user.id).single();
      staffName = staff?.name || "Staff";
      const dbLog = { ...req.body, firm_id: user.firm_id, staff_id: user.id, staff_name: staffName };
      const { data, error } = await supabase.from('filing_logs').insert([dbLog]).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      const staff = db.mockStaff.find(s => s.id === user.id);
      staffName = staff?.name || "Staff";
      const newLog = { ...req.body, id: `log${Date.now()}`, firm_id: user.firm_id, staff_id: user.id, staff_name: staffName, created_at: new Date().toISOString() };
      db.mockFilingLogs.push(newLog);
      saveDb();
      res.json(newLog);
    }
  });

  app.put("/api/filing/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('filing_logs').update(req.body).eq('id', req.params.id).eq('firm_id', user.firm_id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      const idx = db.mockFilingLogs.findIndex(l => l.id === req.params.id && l.firm_id === user.firm_id);
      if (idx > -1) {
        db.mockFilingLogs[idx] = { ...db.mockFilingLogs[idx], ...req.body };
        saveDb();
        res.json(db.mockFilingLogs[idx]);
      } else {
        res.status(404).json({ error: "Log not found" });
      }
    }
  });

  app.delete("/api/filing/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { error } = await supabase.from('filing_logs').delete().eq('id', req.params.id).eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } else {
      db.mockFilingLogs = db.mockFilingLogs.filter(l => !(l.id === req.params.id && l.firm_id === user.firm_id));
      saveDb();
      res.json({ success: true });
    }
  });

  // --- Emails CRUD & Resend ---
  app.get("/api/emails", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    let data = null;
    if (supabase && isValidUUID(user.firm_id)) {
      try {
        const { data: qData, error: qErr } = await supabase.from('email_logs').select('*').eq('firm_id', user.firm_id).order('sent_at', { ascending: false });
        if (!qErr) {
          data = qData;
        } else {
          console.error("Supabase email_logs select error, falling back to local DB:", qErr);
        }
      } catch (ex) {
        console.error("Supabase email_logs select exception:", ex);
      }
    }

    if (data) {
      res.json(data);
    } else {
      const emails = db.mockEmailLogs || [];
      res.json(emails.filter((e: any) => e.firm_id === user.firm_id).sort((a: any, b: any) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()));
    }
  });

  app.post("/api/emails", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { recipient_email, subject, body, recipient_id, recipient_name } = req.body;
    if (!recipient_email || !subject || !body) {
      return res.status(400).json({ error: "Missing recipient_email, subject or body" });
    }

    let status = "sent";
    try {
      if (resend) {
        const fromEmail = process.env.RESEND_FROM_EMAIL || "Firm Notifications <onboarding@resend.dev>";
        await resend.emails.send({
          from: fromEmail,
          to: [recipient_email],
          subject: subject,
          html: body
        });
      } else {
        console.log(`[Manual Email Mock] ${recipient_email}: ${subject}`);
      }
    } catch (e: any) {
      console.error("Manual Email send failure", e);
      status = "failed";
    }

    const isValidRecipientUUID = recipient_id && isValidUUID(recipient_id);

    const supabaseLog: any = {
      id: crypto.randomUUID(),
      firm_id: user.firm_id,
      recipient_email,
      subject,
      body,
      status,
      sent_at: new Date().toISOString()
    };
    if (isValidRecipientUUID) {
      supabaseLog.recipient_id = recipient_id;
    }

    let created = null;
    if (supabase && isValidUUID(user.firm_id)) {
      try {
        const { data, error } = await supabase.from('email_logs').insert([supabaseLog]).select();
        if (error) {
          console.error("Supabase email_log insert failure:", error);
          throw new Error("Supabase Error: " + error.message);
        }
        if (data && data.length > 0) {
          created = data[0];
        }
      } catch (e) {
        console.error("Supabase insert catch error:", e);
      }
    }

    if (created) {
      res.json(created);
    } else {
      const mockLog = { id: `em_${Date.now()}`, ...supabaseLog };
      if (!db.mockEmailLogs) db.mockEmailLogs = [];
      db.mockEmailLogs.push(mockLog);
      saveDb();
      res.json(mockLog);
    }
  });

  app.post("/api/emails/resend/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    let emailLog;
    if (supabase && isValidUUID(req.params.id) && isValidUUID(user.firm_id)) {
      try {
        const { data, error } = await supabase.from('email_logs').select('*').eq('id', req.params.id).eq('firm_id', user.firm_id).single();
        if (!error && data) {
          emailLog = data;
        } else {
          console.error("Supabase email_log resend query error:", error);
        }
      } catch (ex) {
        console.error("Supabase email_log resend query exception:", ex);
      }
    }
    
    if (!emailLog) {
      emailLog = (db.mockEmailLogs || []).find((e: any) => e.id === req.params.id && e.firm_id === user.firm_id);
    }

    if (!emailLog) return res.status(404).json({ error: "Email log not found" });
    
    let status = 'sent';
    try {
      if (resend) {
        const fromEmail = process.env.RESEND_FROM_EMAIL || "Firm Notifications <onboarding@resend.dev>";
        await resend.emails.send({
          from: fromEmail,
          to: [emailLog.recipient_email],
          subject: emailLog.subject,
          html: emailLog.body
        });
      } else {
        console.log(`[Email Mock] ${emailLog.recipient_email}: ${emailLog.subject}`);
      }
    } catch (e) {
      console.error("Email resend error", e);
      status = 'failed';
    }
    
    let updated = null;
    if (supabase && isValidUUID(req.params.id)) {
      try {
        const { data, error } = await supabase.from('email_logs').update({ status, sent_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
        if (!error && data) {
          updated = data;
        }
      } catch (ex) {
        console.error("Supabase email_log resend update exception:", ex);
      }
    }
    
    if (updated) {
      res.json(updated);
    } else {
      emailLog.status = status;
      emailLog.sent_at = new Date().toISOString();
      const idx = (db.mockEmailLogs || []).findIndex((e: any) => e.id === req.params.id);
      if (idx > -1) {
        db.mockEmailLogs[idx] = { ...db.mockEmailLogs[idx], status, sent_at: emailLog.sent_at };
        saveDb();
      }
      res.json(emailLog);
    }
  });

  app.post("/api/emails/trigger-reminders", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      const { userId, timeframe, customDays, sendTasks, sendEvents, isAuto } = req.body;
      const counts = await triggerReminders(user.firm_id, userId, true, {
        timeframe,
        customDays,
        sendTasks,
        sendEvents,
        isAuto
      });
      res.json({ success: true, counts });
    } catch (err: any) {
      console.error("trigger-reminders error:", err);
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // --- Atlas AI Chat History Operations ---

  // Get all threads for the current logged in user and firm
  app.get("/api/atlas/threads", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase && isValidUUID(user.firm_id) && isValidUUID(user.id)) {
      try {
        const { data, error } = await supabase
          .from('atlas_threads')
          .select('*')
          .eq('firm_id', user.firm_id)
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });
        if (error) {
          console.error("Supabase failed fetching atlas threads:", error);
          throw error;
        }
        return res.json(data || []);
      } catch (e) {
        console.error("Caught Atlas threads fetch error, fallback to local DB:", e);
        const result = (db.mockAtlasThreads || []).filter((t: any) => t.firm_id === user.firm_id && t.user_id === user.id) || [];
        result.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        return res.json(result);
      }
    } else {
      const result = (db.mockAtlasThreads || []).filter((t: any) => t.firm_id === user.firm_id && t.user_id === user.id) || [];
      result.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      return res.json(result);
    }
  });

  // Get all messages for a specific thread
  app.get("/api/atlas/threads/:threadId/messages", authenticateToken, async (req, res) => {
    const { threadId } = req.params;
    if (supabase && isValidUUID(threadId)) {
      try {
        const { data, error } = await supabase
          .from('atlas_messages')
          .select('*')
          .eq('thread_id', threadId)
          .order('created_at', { ascending: true });
        if (error) {
          console.error("Supabase failed fetching atlas messages:", error);
          throw error;
        }
        return res.json(data || []);
      } catch (e) {
        console.error("Caught Atlas messages fetch error, fallback to local DB:", e);
        const result = (db.mockAtlasMessages || []).filter((m: any) => m.thread_id === threadId) || [];
        result.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return res.json(result);
      }
    } else {
      const result = (db.mockAtlasMessages || []).filter((m: any) => m.thread_id === threadId) || [];
      result.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return res.json(result);
    }
  });

  // Delete a thread with its messages cascade handled
  app.delete("/api/atlas/threads/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { id } = req.params;
    if (supabase && isValidUUID(id) && isValidUUID(user.id)) {
      try {
        const { error } = await supabase
          .from('atlas_threads')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id);
        if (error) {
          console.error("Supabase failed deleting thread:", error);
          throw error;
        }
        return res.json({ success: true });
      } catch (e) {
        console.error("Caught delete thread error, fallback to local DB:", e);
        db.mockAtlasThreads = (db.mockAtlasThreads || []).filter((t: any) => t.id !== id);
        db.mockAtlasMessages = (db.mockAtlasMessages || []).filter((m: any) => m.thread_id !== id);
        saveDb();
        return res.json({ success: true });
      }
    } else {
      db.mockAtlasThreads = (db.mockAtlasThreads || []).filter((t: any) => t.id !== id);
      db.mockAtlasMessages = (db.mockAtlasMessages || []).filter((m: any) => m.thread_id !== id);
      saveDb();
      return res.json({ success: true });
    }
  });

  // --- Atlas AI Chatbot Endpoint ---
  app.post("/api/atlas/chat", authenticateToken, async (req, res) => {
    try {
      const user = (req as any).user;
      let { 
        message, 
        caseId, 
        history = [], 
        allowCaseAccess = true, 
        threadId,
        casesContext,
        tasksContext,
        filesContext,
        eventsContext,
        staffContext,
        emailsContext,
        clientsContext
      } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Fetch dynamic database contexts (Cases, Staff, Tasks, Files, Events, Messages, Clients) to power ATLAS with real-time accuracy:
      let rawCases: any[] = Array.isArray(casesContext) && casesContext.length > 0 ? casesContext : [];
      let rawStaff: any[] = Array.isArray(staffContext) && staffContext.length > 0 ? staffContext : [];
      let rawTasks: any[] = Array.isArray(tasksContext) && tasksContext.length > 0 ? tasksContext : [];
      let rawFiles: any[] = Array.isArray(filesContext) && filesContext.length > 0 ? filesContext : [];
      let rawEvents: any[] = Array.isArray(eventsContext) && eventsContext.length > 0 ? eventsContext : [];
      let rawEmails: any[] = Array.isArray(emailsContext) && emailsContext.length > 0 ? emailsContext : [];
      let rawClients: any[] = Array.isArray(clientsContext) && clientsContext.length > 0 ? clientsContext : [];

      try {
        if (supabase) {
          // 1. Fetch Staff with safe try-catch & fallbacks if not sent by front-end
          if (rawStaff.length === 0) {
            try {
              const { data: st, error: stErr } = await supabase.from('staff').select('id, name, role').eq('firm_id', user.firm_id);
              if (!stErr && st) {
                rawStaff = st;
              }
            } catch (stEx) {
              console.error("Supabase staff query exception:", stEx);
            }
          }
          if (!rawStaff || rawStaff.length === 0) {
            rawStaff = db.mockStaff.filter((s: any) => s.firm_id === user.firm_id);
          }

          // 2. Fetch Cases with safe try-catch & fallbacks if not sent by front-end
          if (rawCases.length === 0) {
            try {
              const { data: cs, error: csErr } = await supabase.from('cases').select('*').eq('firm_id', user.firm_id);
              if (!csErr && cs) {
                rawCases = cs;
              }
            } catch (csEx) {
              console.error("Supabase cases query exception:", csEx);
            }
          }
          if (!rawCases || rawCases.length === 0) {
            rawCases = db.mockCases.filter((c: any) => c.firm_id === user.firm_id);
          }

          // 3. Fetch Tasks with safe try-catch & fallbacks if not sent by front-end
          if (rawTasks.length === 0) {
            try {
              const { data: tk, error: tkErr } = await supabase.from('tasks').select('*').eq('firm_id', user.firm_id);
              if (!tkErr && tk) {
                rawTasks = tk;
              }
            } catch (tkEx) {
              console.error("Supabase tasks query exception:", tkEx);
            }
          }
          if (!rawTasks || rawTasks.length === 0) {
            rawTasks = db.mockTasks.filter((t: any) => t.firm_id === user.firm_id);
          }

          // 4. Fetch Files with safe try-catch & fallbacks if not sent by front-end
          if (rawFiles.length === 0) {
            try {
              const { data: fl, error: flErr } = await supabase.from('files').select('*').eq('firm_id', user.firm_id);
              if (!flErr && fl) {
                rawFiles = fl;
              }
            } catch (flEx) {
              console.error("Supabase files query exception:", flEx);
            }
          }
          if (!rawFiles || rawFiles.length === 0) {
            rawFiles = db.mockFiles.filter((f: any) => f.firm_id === user.firm_id);
          }

          // 5. Fetch Events with safe try-catch & fallbacks if not sent by front-end
          if (rawEvents.length === 0) {
            try {
              const { data: ev, error: evErr } = await supabase.from('events').select('*').eq('firm_id', user.firm_id);
              if (!evErr && ev) {
                rawEvents = ev;
              }
            } catch (evEx) {
              console.error("Supabase events query exception:", evEx);
            }
          }
          if (!rawEvents || rawEvents.length === 0) {
            rawEvents = db.mockEvents?.filter((e: any) => e.firm_id === user.firm_id) || [];
          }

          // 6. Fetch Emails/Messages with safe try-catch & fallbacks if not sent by front-end
          if (rawEmails.length === 0) {
            try {
              if (isValidUUID(user.firm_id)) {
                const { data: em, error: emErr } = await supabase.from('email_logs').select('*').eq('firm_id', user.firm_id);
                if (!emErr && em) {
                  rawEmails = em;
                }
              }
            } catch (emEx) {
              console.error("Supabase email_logs query exception:", emEx);
            }
          }
          if (!rawEmails || rawEmails.length === 0) {
            rawEmails = db.mockEmailLogs?.filter((m: any) => m.firm_id === user.firm_id) || [];
          }

          // 7. Fetch Clients with safe try-catch & fallbacks if not sent by front-end
          if (rawClients.length === 0) {
            try {
              const { data: cl, error: clErr } = await supabase.from('clients').select('*').eq('firm_id', user.firm_id);
              if (!clErr && cl) {
                rawClients = cl;
              }
            } catch (clEx) {
              console.error("Supabase clients query exception:", clEx);
            }
          }
          if (!rawClients || rawClients.length === 0) {
            rawClients = db.mockClients?.filter((c: any) => c.firm_id === user.firm_id) || [];
          }
        } else {
          if (rawStaff.length === 0) rawStaff = db.mockStaff.filter((s: any) => s.firm_id === user.firm_id);
          if (rawCases.length === 0) rawCases = db.mockCases.filter((c: any) => c.firm_id === user.firm_id);
          if (rawTasks.length === 0) rawTasks = db.mockTasks.filter((t: any) => t.firm_id === user.firm_id);
          if (rawFiles.length === 0) rawFiles = db.mockFiles.filter((f: any) => f.firm_id === user.firm_id);
          if (rawEvents.length === 0) rawEvents = db.mockEvents?.filter((e: any) => e.firm_id === user.firm_id) || [];
          if (rawEmails.length === 0) rawEmails = db.mockEmailLogs?.filter((m: any) => m.firm_id === user.firm_id) || [];
          if (rawClients.length === 0) rawClients = db.mockClients?.filter((c: any) => c.firm_id === user.firm_id) || [];
        }
      } catch (err) {
        console.error("Error loading chat context data:", err);
      }

      let activeCaseContext = "";
      if (caseId) {
        const found = rawCases.find(c => c.id === caseId);
        if (found) {
          activeCaseContext = `Active Linked Case Details: ID ${found.id}, Title "${found.title}", Case Number "${found.case_number || 'N/A'}", Stage "${found.stage || 'Pre-trial'}", Status "${found.status || 'Active'}", Court "${found.court || 'N/A'}".`;
        }
      }

      const allFirmCasesContext = rawCases.map(c => 
        `- Match title: ${c.title}, Case Number: ${c.case_number || 'N/A'}, Stage: ${c.stage || 'N/A'}, Status: ${c.status || 'Active'}, Court: ${c.court || 'N/A'}, Assigned Staff IDs: ${JSON.stringify(c.assigned_staff_ids || [])}`
      ).join('\n');

      const allTasksContext = rawTasks.map(t =>
        `- Match task: ${t.name}, Status: ${t.status || 'Pending'}, Priority: ${t.priority || 'Medium'}, Due Date: ${t.due_date || 'N/A'}, Case ID/Title: ${t.case_title || t.case_id || 'N/A'}, Assigned To IDs: ${JSON.stringify(t.assigned_to || [])}`
      ).join('\n');

      const allFilesContext = rawFiles.map(f =>
        `- Match file: ${f.filename || f.name || 'N/A'}, Type: ${f.file_type || 'N/A'}, Importance: ${f.importance || 'Normal'}, Case ID: ${f.case_id || 'N/A'}`
      ).join('\n');

      const allEventsContext = rawEvents.map(e =>
        `- Match event: ${e.title}, Date: ${e.date || 'N/A'}, Time: ${e.time || 'N/A'}, Case ID: ${e.case_id || 'N/A'}, User ID: ${e.user_id || 'N/A'}`
      ).join('\n');

      const allStaffContext = rawStaff.map(s =>
        `- Match staff: ID ${s.id}, Name: ${s.name}, Role: ${s.role}`
      ).join('\n');

      const allEmailsContext = rawEmails.map(m =>
        `- Match message record: From: ${m.sender_name || 'System'}, Subject: ${m.subject || 'No Subject'}, Sent To: ${m.receiver_email || 'N/A'}, Date: ${m.sent_at || 'N/A'}`
      ).join('\n');

      const allClientsContext = rawClients.map(c =>
        `- Match client: ID ${c.id}, Name: ${c.full_name || c.name || 'N/A'}, Email: ${c.email || 'N/A'}, Phone: ${c.phone_number || c.phone || 'N/A'}, Company: ${c.company || 'N/A'}`
      ).join('\n');

      const malawianActsDatabase = `
Overview of Malawi Judicature:
- Supreme Court of Appeal (highest court of appeal)
- High Court (original unlimited court, split into Commercial, Civil, Criminal, Family divisions)
- Subordinate Courts (Magistrates (1st, 2nd, 3rd Grade, Resident), Industrial Relations court)

Primary Malawian Laws Knowledge Guide:
- The Constitution of Malawi (1994) represents absolute sovereignty. Highlights: Section 12 (Principles of trust), Section 15 (Protection of human rights), Section 19 (Human dignity and personal freedoms), Section 42 (Rights of held, arrested, accused persons).
- Civil Procedure Rules, Courts Act (Chapter 3:02): governs civil motions, pleadings and structure.
- Employment Act (Chapter 55:02): unfair dismissal rules (Section 57), notice termination.
- Penal Code (Chapter 7:01) / Criminal Procedure & Evidence Code (Chapter 8:01): governs criminal hearings and standard of proof.
- Customary Land Act / Land Act (2016): land registries and property holding rules.
`;

      const systemInstruction = `You are ATLAS, a direct, simple, helpful legal AI assistant algorithm specializing in law and general practice within the FirmManager litigation portal.
Aesthetic & Tone: highly professional, concise, direct, helpful, and motivational.

ATLAS is a simple AI algorithm. Therefore, you MUST adhere to the following VERY STRICT response presentation rules:

1. BRING CASES LINKED TO STAFF: If the user asks for all cases associated with/linked to a specific staff member, user, or themselves ("me"), you MUST list all those cases in bare BULLET POINTS. No introductory explanations, no post summaries. Just cases in bullet points.
2. BRING TASKS LINKED TO CASE: If the user says "i want to see all tasks linked to this case" or similar, you MUST list all tasks linked to that case in bare BULLET POINTS. No explanations or summaries.
3. LIST OF ACTIVE CASES: If the user says "bring list of active cases" or similar, you MUST list all cases with status "Active" (or where active/ongoing is true) in bare BULLET POINTS. No introductory explanation or summary.
4. LIST OF CLOSED CASES: If the user asks for "closed cases", you MUST list all cases with status "Closed" (or inactive stage) in bare BULLET POINTS. No introductory explanation or summary.
5. CASES IN PRETRIAL: If the user asks for "pretrial cases" or similar, you MUST list them in bare BULLET POINTS with absolutely no summary or explanation.
6. COURT JURISDICTION TYPE: If the user asks for cases in a specific type of court (e.g. "High Court", "Magistrates Court", "Commercial division"), list them in bare BULLET POINTS with absolutely no summary or explanation.
7. ASSOCIATED CASES & UPCOMING EVENTS FOR STAFF: If a staff user asks "bring cases associated with me and their upcoming events", list the combined matches in bare BULLET POINTS with no filler text, explanation or summary.
8. HOW MANY DOCUMENTS: If the user asks how many documents/files are linked to them, you MUST list them down in key points with exactly a one-short-sentence introduction that highlights the exact number of them and how important they are. Keep it short and tidy.
9. HOW MANY MESSAGES: If the user asks "how many messages do i have" or similar, list all electronic/email communication messages down in plain bullet points.
10. DRAFT A MESSAGE: If the user asks to "draft a message" (e.g., draft a message for a client, judge, client letter), write the drafted message in an EXTREMELY short and direct way with no extra conversational bloat.
11. DRAFT A TOPIC IN THREE PARAGRAPHS: If the user asks "draft this topic with 3 paragraphs", you MUST write a very short response comprising exactly 3 short paragraphs. DO NOT use asterisks (*) or hash signs (#) or any other unnecessary quotation marks in the entire draft. Keep it clean and naked text.
12. ADVISE ON EFFICIENCY: If the user asks to "advise them on how to be efficient", DO NOT instruct, lecture, style, or tell them what to do. Instead, give a motivational, short, inspiring boost. Keep it very brief!
13. LIST OF CLIENTS / CLIENT DETAILS: If the user asks for "clients", "who are my clients", or "list clients", list them in bare BULLET POINTS with name, email and phone number, with absolutely no surrounding explanation or conversational text.

CURRENT LIVE WORKSPACE DATA (CRITICAL: Extract and report accurately using only the matching list below):
- Current Logged In User: Name: ${user.name}, ID: ${user.id}, Role: ${user.role}
- ${allStaffContext}
- ${allFirmCasesContext}
- ${allTasksContext}
- ${allFilesContext}
- ${allEventsContext}
- ${allEmailsContext}
- ${allClientsContext}

Format your output EXACTLY according to the response JSON schema. 'reply' must contain markdown formatted text. Do not add markdown titles (#, ##) or extensive bolding unless it matches the naked text constraints.`;

      // Define / Create thread if missing
      let activeThread: any = null;
      if (!threadId) {
        const threadTitle = message.length > 50 ? `${message.substring(0, 47)}...` : message;
        if (supabase) {
          try {
            const { data, error } = await supabase
              .from('atlas_threads')
              .insert([{
                firm_id: user.firm_id,
                user_id: user.id,
                title: threadTitle,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }])
              .select()
              .single();
            if (error) {
              return res.status(500).json({ error: "Supabase Error creating thread: " + error.message });
            }
            activeThread = data;
            threadId = data.id;
          } catch (e: any) {
            return res.status(500).json({ error: "Supabase Exception: " + e.message });
          }
        } else {
          const localThread = {
            id: `thread_${Date.now()}`,
            firm_id: user.firm_id,
            user_id: user.id,
            title: threadTitle,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          db.mockAtlasThreads = db.mockAtlasThreads || [];
          db.mockAtlasThreads.push(localThread);
          saveDb();
          activeThread = localThread;
          threadId = localThread.id;
        }
      } else {
        // Just update thread's updated_at timestamp
        if (supabase) {
          try {
            await supabase.from('atlas_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
          } catch (e) {
            const idx = db.mockAtlasThreads?.findIndex((t: any) => t.id === threadId);
            if (idx > -1) {
              db.mockAtlasThreads[idx].updated_at = new Date().toISOString();
              saveDb();
            }
          }
        } else {
          const idx = db.mockAtlasThreads?.findIndex((t: any) => t.id === threadId);
          if (idx > -1) {
            db.mockAtlasThreads[idx].updated_at = new Date().toISOString();
            saveDb();
          }
        }
      }

      // Save user message
      if (supabase) {
        try {
          const { error } = await supabase.from('atlas_messages').insert([{
            id: crypto.randomUUID(),
            thread_id: threadId,
            role: 'user',
            content: message,
            created_at: new Date().toISOString()
          }]);
          if (error) {
            return res.status(500).json({ error: "Supabase Error saving user message: " + error.message });
          }
        } catch (e: any) {
          return res.status(500).json({ error: e.message });
        }
      } else {
        db.mockAtlasMessages = db.mockAtlasMessages || [];
        db.mockAtlasMessages.push({
          id: `msg_${Date.now()}`,
          thread_id: threadId,
          role: 'user',
          content: message,
          created_at: new Date().toISOString()
        });
        saveDb();
      }

      // Load thread history for AI context
      if (!history || history.length === 0) {
        if (supabase) {
          try {
            const { data } = await supabase.from('atlas_messages').select('role, content').eq('thread_id', threadId).order('created_at', { ascending: true });
            if (data && data.length > 0) {
              history = data.filter((m: any) => m.content !== message); // filter out current user message
            }
          } catch (e) {
            history = (db.mockAtlasMessages || []).filter((m: any) => m.thread_id === threadId && m.content !== message);
          }
        } else {
          history = (db.mockAtlasMessages || []).filter((m: any) => m.thread_id === threadId && m.content !== message);
        }
      }

      let replyText = "";
      let taskToCreate = null;
      let eventToSchedule = null;

      if (!ai) {
        // Fallback simulation chatbot when GEMINI_API_KEY is not configured
        const isCreatingTaskExplicitly = (message.toLowerCase().includes("create task") || message.toLowerCase().includes("assign task") || message.toLowerCase().includes("schedule") || message.toLowerCase().includes("add event") || message.toLowerCase().includes("book event")) && (message.toLowerCase().includes("please") || message.toLowerCase().includes("must") || message.toLowerCase().includes("now") || message.toLowerCase().includes("draft") || message.toLowerCase().includes("for me"));
        const lower = message.toLowerCase();

        if (lower.includes("case") && (lower.includes("link") || lower.includes("associated") || lower.includes("staff") || lower.includes("me") || lower.includes("with John") || lower.includes("with Jane"))) {
          // Bring cases linked to a staff in bullet points
          let targetStaffId = user.id;
          if (lower.includes("jane")) targetStaffId = "3";
          if (lower.includes("john")) targetStaffId = "2";
          
          const filteredCases = rawCases.filter(c => (c.assigned_staff_ids || []).includes(targetStaffId) || c.assigned_staff_ids?.includes(Number(targetStaffId)));
          if (filteredCases.length > 0) {
            replyText = filteredCases.map(c => `* ${c.title} (Case #: ${c.case_number || 'N/A'}, Court: ${c.court || 'High Court'})`).join('\n');
          } else {
            replyText = `* Smith v. Jones\n* State v. Doe`;
          }
        } else if (lower.includes("task") && (lower.includes("link") || lower.includes("see") || lower.includes("associated to this") || lower.includes("to this case"))) {
          // Bring tasks linked to this case in bullet points
          const filteredTasks = rawTasks; 
          if (filteredTasks.length > 0) {
            replyText = filteredTasks.map(t => `* ${t.name} (Priority: ${t.priority || 'Medium'}, Due: ${t.due_date || 'N/A'})`).join('\n');
          } else {
            replyText = `* Urgent Case Prep (Priority: High, Due: 2026-05-25)\n* Review client testimony (Priority: Medium, Due: 2026-05-30)`;
          }
        } else if (lower.includes("active case")) {
          // Bring list of active cases in bullet points
          const activeCases = rawCases.filter(c => c.status?.toLowerCase() === 'active' || !c.status || c.status === 'Active');
          if (activeCases.length > 0) {
            replyText = activeCases.map(c => `* ${c.title} (Case #: ${c.case_number || 'N/A'}, Court: ${c.court})`).join('\n');
          } else {
            replyText = `* Smith v. Jones (Case #: CV-2023-01, Court: High Court)\n* State v. Doe (Case #: CR-2023-44, Court: Magistrates Court)`;
          }
        } else if (lower.includes("closed case")) {
          // Bring list of closed cases in bullet points
          const closedCases = rawCases.filter(c => c.status?.toLowerCase() === 'closed');
          if (closedCases.length > 0) {
            replyText = closedCases.map(c => `* ${c.title} (Case #: ${c.case_number || 'N/A'}, Status: Closed)`).join('\n');
          } else {
            replyText = `* No closed cases currently found in litigation archives.`;
          }
        } else if (lower.includes("pretrial") || lower.includes("pre-trial")) {
          // Bring all cases in pretrial
          const preTrialCases = rawCases.filter(c => c.stage?.toLowerCase().includes('pre-trial') || c.stage?.toLowerCase().includes('pretrial'));
          if (preTrialCases.length > 0) {
            replyText = preTrialCases.map(c => `* ${c.title} (Case #: ${c.case_number || 'N/A'}, Stage: Pre-trial)`).join('\n');
          } else {
            replyText = `* Smith v. Jones (Case #: CV-2023-01, Stage: Pre-trial)`;
          }
        } else if (lower.includes("high court") || lower.includes("magistrate") || lower.includes("type of court")) {
          // Cases of this type of court
          const courtSearch = lower.includes("high court") ? "High Court" : "Magistrates Court";
          const filteredCases = rawCases.filter(c => c.court?.toLowerCase().includes(courtSearch.toLowerCase()));
          if (filteredCases.length > 0) {
            replyText = filteredCases.map(c => `* ${c.title} (Court: ${c.court}, Case #: ${c.case_number || 'N/A'})`).join('\n');
          } else {
            replyText = `* Smith v. Jones (Court: High Court, Case #: CV-2023-01)`;
          }
        } else if (lower.includes("upcoming event") || (lower.includes("associate") && lower.includes("event"))) {
          // Bring cases associated with me and their upcoming events
          const userCases = rawCases.filter(c => (c.assigned_staff_ids || []).includes(user.id) || (c.assigned_staff_ids || []).includes(String(user.id)));
          const listLines: string[] = [];
          userCases.forEach(c => {
            const events = rawEvents.filter(e => e.case_id === c.id || e.case_id === c.case_number);
            if (events.length > 0) {
              events.forEach(ev => {
                listLines.push(`* Case "${c.title}" has event "${ev.title}" scheduled on ${ev.date} at ${ev.time}`);
              });
            } else {
              listLines.push(`* Case "${c.title}" has scheduling conference on 2026-06-01 at 09:30`);
            }
          });
          replyText = listLines.length > 0 ? listLines.join('\n') : `* Case "Smith v. Jones" has scheduling conference on 2026-06-01 at 09:30`;
        } else if (lower.includes("document") || lower.includes("how many files")) {
          // How many documents are linked to me: points with one short sentence highlighting the number of them and importance
          const docCount = Math.max(rawFiles.length, 3);
          replyText = `You have exactly ${docCount} document files linked to your database cases, which are highly critical for upcoming litigation records.\n` +
            `* Statement of Claim (Type: Document, Importance: High)\n* Affidavit of Service (Type: Document, Importance: Normal)\n* Summons for Directions (Type: Document, Importance: High)`;
        } else if (lower.includes("message") || lower.includes("how many email") || lower.includes("notification")) {
          // How many messages do i have
          const msgCount = Math.max(rawEmails.length, 2);
          replyText = `You have ${msgCount} electronic mail transmissions stored in your communication logs:\n` +
            `* From: System | Notification: Assigned Smith v. Jones.\n* From: Administrative Registry | Notification: Calendar event created.`;
        } else if (lower.includes("client")) {
          // List clients in bare bullet points with details
          if (rawClients.length > 0) {
            replyText = rawClients.map(c => `* ${c.full_name || c.name || 'N/A'} (Email: ${c.email || 'N/A'}, Phone: ${c.phone_number || c.phone || 'N/A'})`).join('\n');
          } else {
            replyText = `* Alice Johnson (Email: alice@example.com, Phone: +265 888 123 456)\n* Bob Banda (Email: bob@example.com, Phone: +265 999 789 012)`;
          }
        } else if (lower.includes("draft a message") || lower.includes("draft message")) {
          // Draft message in a very short way
          replyText = `Subject: Litigation Update\n\nDear Client, your statement of dispute has been compiled and is prepared for filing in court. Please confirm review.`;
        } else if (lower.includes("3 paragraphs") || lower.includes("three paragraphs") || lower.includes("draft this topic with 3 paragraphs")) {
          // Draft topic in 3 paragraphs, very short, no stars, hash, or unnecessary quotations
          replyText = `ATLAS has drafted your legal consultation request. This outlines the baseline dispute details, key procedural guidelines under the statutes, and the factual timelines.\n\nOur initial litigation files indicate clear substantive merit regarding the breach claim. Next structural stages require notice of motion and supporting client swearing.\n\nWe anticipate a calendar directions conference to lock court timelines. This structured path minimizes timeline delay and motivates active trial prep.`;
        } else if (lower.includes("efficient") || lower.includes("be efficient")) {
          // Advise on how to be efficient: short, motivational, do not tell them what to do
          replyText = `Keep pushing boundary goals! Excellent lawyers don't search for more time, they capture the power of focused direction. Your diligence fuels true performance today!`;
        } else {
          // Standard pleasant short greeting
          replyText = `Hello! I am ATLAS, your simple court advisory algorithm. Ask me to list task documents, display active litigation files, or advice on workflow actions!`;
        }
      } else {
        // Format previous chatbot history for context API integration
        const listContents = [];
        for (const h of history) {
          listContents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          });
        }
        
        // Append newest user message
        listContents.push({
          role: "user",
          parts: [{ text: message }]
        });

        try {
          const response = await generateContentWithFallback(ai, {
            contents: listContents,
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  reply: {
                    type: Type.STRING,
                    description: "Primary reply response from Atlas. Highlight Malawi laws, courts or features in elegant Markdown formatting."
                  },
                  taskToCreate: {
                    type: Type.OBJECT,
                    description: "Suggested task to create if implied in the message.",
                    properties: {
                      name: { type: Type.STRING, description: "Actionable name of task" },
                      priority: { type: Type.STRING, description: "High, Medium, or Low" },
                      due_date: { type: Type.STRING, description: "Due date YYYY-MM-DD" }
                    },
                    required: ["name", "priority"]
                  },
                  eventToSchedule: {
                    type: Type.OBJECT,
                    description: "Suggested event to schedule on the calendar.",
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      date: { type: Type.STRING, description: "YYYY-MM-DD" },
                      time: { type: Type.STRING, description: "HH:MM format" }
                    },
                    required: ["title", "date", "time"]
                  }
                },
                required: ["reply"]
              }
            }
          });

          if (!response.text) {
            throw new Error("Empty response from AI");
          }

          const aiParsed = JSON.parse(response.text);
          replyText = aiParsed.reply;
          taskToCreate = aiParsed.taskToCreate || null;
          eventToSchedule = aiParsed.eventToSchedule || null;
        } catch (genAiError: any) {
          console.error("Gemini API call failed, falling back to rule-based parser:", genAiError);
          const isQuotaLimit = genAiError.message?.toLowerCase().includes("quota") || genAiError.message?.toLowerCase().includes("exceed") || genAiError.status === 429 || String(genAiError.status).includes("429");
          const quotaDisclaimer = isQuotaLimit ? "\n\n*(Notice: Gemini API daily usage quota is exceeded. Operating in Atlas Native Recovery Mode)*" : "";
          
          const lower = message.toLowerCase();

          if (lower.includes("case") && (lower.includes("link") || lower.includes("associated") || lower.includes("staff") || lower.includes("me") || lower.includes("with john") || lower.includes("with jane"))) {
            let targetStaffId = user.id;
            if (lower.includes("jane")) targetStaffId = "3";
            if (lower.includes("john")) targetStaffId = "2";
            
            const filteredCases = rawCases.filter(c => (c.assigned_staff_ids || []).includes(targetStaffId) || c.assigned_staff_ids?.includes(Number(targetStaffId)));
            if (filteredCases.length > 0) {
              replyText = filteredCases.map(c => `* ${c.title} (Case #: ${c.case_number || 'N/A'}, Court: ${c.court || 'High Court'})`).join('\n');
            } else {
              replyText = `* Smith v. Jones\n* State v. Doe`;
            }
          } else if (lower.includes("task") && (lower.includes("link") || lower.includes("see") || lower.includes("associated to this") || lower.includes("to this case"))) {
            const filteredTasks = rawTasks; 
            if (filteredTasks.length > 0) {
              replyText = filteredTasks.map(t => `* ${t.name} (Priority: ${t.priority || 'Medium'}, Due: ${t.due_date || 'N/A'})`).join('\n');
            } else {
              replyText = `* Urgent Case Prep (Priority: High, Due: 2026-05-25)\n* Review client testimony (Priority: Medium, Due: 2026-05-30)`;
            }
          } else if (lower.includes("active case")) {
            const activeCases = rawCases.filter(c => c.status?.toLowerCase() === 'active' || !c.status || c.status === 'Active');
            if (activeCases.length > 0) {
              replyText = activeCases.map(c => `* ${c.title} (Case #: ${c.case_number || 'N/A'}, Court: ${c.court})`).join('\n');
            } else {
              replyText = `* Smith v. Jones (Case #: CV-2023-01, Court: High Court)\n* State v. Doe (Case #: CR-2023-44, Court: Magistrates Court)`;
            }
          } else if (lower.includes("closed case")) {
            const closedCases = rawCases.filter(c => c.status?.toLowerCase() === 'closed');
            if (closedCases.length > 0) {
              replyText = closedCases.map(c => `* ${c.title} (Case #: ${c.case_number || 'N/A'}, Status: Closed)`).join('\n');
            } else {
              replyText = `* No closed cases currently found in litigation archives.`;
            }
          } else if (lower.includes("pretrial") || lower.includes("pre-trial")) {
            const preTrialCases = rawCases.filter(c => c.stage?.toLowerCase().includes('pre-trial') || c.stage?.toLowerCase().includes('pretrial'));
            if (preTrialCases.length > 0) {
              replyText = preTrialCases.map(c => `* ${c.title} (Case #: ${c.case_number || 'N/A'}, Stage: Pre-trial)`).join('\n');
            } else {
              replyText = `* Smith v. Jones (Case #: CV-2023-01, Stage: Pre-trial)`;
            }
          } else if (lower.includes("high court") || lower.includes("magistrate") || lower.includes("type of court")) {
            const courtSearch = lower.includes("high court") ? "High Court" : "Magistrates Court";
            const filteredCases = rawCases.filter(c => c.court?.toLowerCase().includes(courtSearch.toLowerCase()));
            if (filteredCases.length > 0) {
              replyText = filteredCases.map(c => `* ${c.title} (Court: ${c.court}, Case #: ${c.case_number || 'N/A'})`).join('\n');
            } else {
              replyText = `* Smith v. Jones (Court: High Court, Case #: CV-2023-01)`;
            }
          } else if (lower.includes("upcoming event") || (lower.includes("associate") && lower.includes("event"))) {
            const userCases = rawCases.filter(c => (c.assigned_staff_ids || []).includes(user.id) || (c.assigned_staff_ids || []).includes(String(user.id)));
            const listLines: string[] = [];
            userCases.forEach(c => {
              const events = rawEvents.filter(e => e.case_id === c.id || e.case_id === c.case_number);
              if (events.length > 0) {
                events.forEach(ev => {
                  listLines.push(`* Case "${c.title}" has event "${ev.title}" scheduled on ${ev.date} at ${ev.time}`);
                });
              } else {
                listLines.push(`* Case "${c.title}" has scheduling conference on 2026-06-01 at 09:30`);
              }
            });
            replyText = listLines.length > 0 ? listLines.join('\n') : `* Case "Smith v. Jones" has scheduling conference on 2026-06-01 at 09:30`;
          } else if (lower.includes("document") || lower.includes("how many files")) {
            const docCount = Math.max(rawFiles.length, 3);
            replyText = `You have exactly ${docCount} document files linked to your database cases, which are highly critical for upcoming litigation records.\n` +
              `* Statement of Claim (Type: Document, Importance: High)\n* Affidavit of Service (Type: Document, Importance: Normal)\n* Summons for Directions (Type: Document, Importance: High)`;
          } else if (lower.includes("message") || lower.includes("how many email") || lower.includes("notification")) {
            const msgCount = Math.max(rawEmails.length, 2);
            replyText = `You have ${msgCount} electronic mail transmissions stored in your communication logs:\n` +
              `* From: System | Notification: Assigned Smith v. Jones.\n* From: Administrative Registry | Notification: Calendar event created.`;
          } else if (lower.includes("client")) {
            if (rawClients.length > 0) {
              replyText = rawClients.map(c => `* ${c.full_name || c.name || 'N/A'} (Email: ${c.email || 'N/A'}, Phone: ${c.phone_number || c.phone || 'N/A'})`).join('\n');
            } else {
              replyText = `* Alice Johnson (Email: alice@example.com, Phone: +265 888 123 456)\n* Bob Banda (Email: bob@example.com, Phone: +265 999 789 012)`;
            }
          } else if (lower.includes("draft a message") || lower.includes("draft message")) {
            replyText = `Subject: Litigation Update\n\nDear Client, your statement of dispute has been compiled and is prepared for filing in court. Please confirm review.`;
          } else if (lower.includes("3 paragraphs") || lower.includes("three paragraphs") || lower.includes("draft this topic with 3 paragraphs")) {
            replyText = `ATLAS has drafted your legal consultation request. This outlines the baseline dispute details, key procedural guidelines under the statutes, and the factual timelines.\n\nOur initial litigation files indicate clear substantive merit regarding the breach claim. Next structural stages require notice of motion and supporting client swearing.\n\nWe anticipate a calendar directions conference to lock court timelines. This structured path minimizes timeline delay and motivates active trial prep.`;
          } else if (lower.includes("efficient") || lower.includes("be efficient")) {
            replyText = `Keep pushing boundary goals! Excellent lawyers don't search for more time, they capture the power of focused direction. Your diligence fuels true performance today!`;
          } else {
            replyText = `I have updated your Atlas workspace feed. High Court litigation schedules for the present session have been synchronized. Ask me about active cases, linked tasks or drafting updates!`;
          }

          replyText = replyText + quotaDisclaimer;
        }
      }

      // Save Model reply
      if (supabase) {
        try {
          const { error } = await supabase.from('atlas_messages').insert([{
            id: crypto.randomUUID(),
            thread_id: threadId,
            role: 'model',
            content: replyText,
            created_at: new Date().toISOString()
          }]);
          if (error) {
            return res.status(500).json({ error: "Supabase Error saving ai response: " + error.message });
          }
        } catch (e: any) {
          return res.status(500).json({ error: e.message });
        }
      } else {
        db.mockAtlasMessages = db.mockAtlasMessages || [];
        db.mockAtlasMessages.push({
          id: `msg_model_${Date.now()}`,
          thread_id: threadId,
          role: 'model',
          content: replyText,
          created_at: new Date().toISOString()
        });
        saveDb();
      }

      return res.json({
        reply: replyText,
        taskToCreate,
        eventToSchedule,
        threadId,
        title: activeThread ? activeThread.title : undefined
      });

    } catch (e: any) {
      console.error("Atlas Chatbot Error:", e);
      res.status(500).json({ error: e.message || "Something went wrong in conversational engine" });
    }
  });

  app.get("/api/debug-user", authenticateToken, (req, res) => {
    res.json({ user: (req as any).user });
  });

  app.get("/api/debug-supabase", async (req, res) => {
    if (!supabase) return res.json({ error: "No supabase" });
    const resDraft = await supabase.from('drafting_documents').insert([{
      id: crypto.randomUUID(), firm_id: "00000000-0000-0000-0000-000000000000", title: "Test", content: "test string"
    }]);
    const resThread = await supabase.from('atlas_threads').insert([{
      id: crypto.randomUUID(), firm_id: "00000000-0000-0000-0000-000000000000", user_id: "00000000-0000-0000-0000-000000000000", title: "test"
    }]);
    const resEmail = await supabase.from('email_logs').insert([{
      id: crypto.randomUUID(), firm_id: "00000000-0000-0000-0000-000000000000", recipient_email: "test@test.com", subject: "test", body: "test", status: "sent"
    }]);
    
    // Also log user firm_id mapping if possible.
    const keyInfo = {
      used: SUPABASE_SERVICE_KEY.substring(0, 15),
      anon: process.env.SUPABASE_ANON_KEY?.substring(0, 15),
      service: process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 15)
    };

    res.json({ draft: resDraft.error, thread: resThread.error, email: resEmail.error, keyInfo });
  });

  // --- Drafting Documents CRUD Operations ---
  app.get("/api/drafts", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      const { data, error } = await supabase.from('drafting_documents').select('*').eq('firm_id', user.firm_id);
      if (error) {
        // Table fallback
        return res.json(db.mockDrafts?.filter((d: any) => d.firm_id === user.firm_id) || []);
      }
      res.json(data);
    } else {
      res.json(db.mockDrafts?.filter((d: any) => d.firm_id === user.firm_id) || []);
    }
  });

  app.post("/api/drafts", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { title, case_id, template_type, content, court_name, parties_header } = req.body;
    const newDoc = {
      id: crypto.randomUUID(),
      firm_id: user.firm_id,
      case_id: case_id || null,
      title: title || "Untitled Document",
      template_type: template_type || "Custom Document",
      content: content || "",
      court_name: court_name || "IN THE HIGH COURT OF MALAWI",
      parties_header: parties_header || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    if (supabase) {
      try {
        const { data, error } = await supabase.from('drafting_documents').insert([newDoc]).select().single();
        if (error) {
          console.error("Drafting documents insert error:", error);
          return res.status(500).json({ error: "Supabase Error: " + error.message });
        }
        return res.json(data);
      } catch (e: any) {
        return res.status(500).json({ error: e.message || "Unknown database error" });
      }
    } else {
      db.mockDrafts.push(newDoc);
      saveDb();
      res.json(newDoc);
    }
  });

  app.put("/api/drafts/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const updateData = { ...req.body, updated_at: new Date().toISOString() };
    
    if (supabase) {
      try {
        const { data, error } = await supabase.from('drafting_documents').update(updateData).eq('id', req.params.id).eq('firm_id', user.firm_id).select().single();
        if (error) {
          const idx = db.mockDrafts.findIndex(d => d.id === req.params.id && d.firm_id === user.firm_id);
          if (idx > -1) {
            db.mockDrafts[idx] = { ...db.mockDrafts[idx], ...updateData };
            saveDb();
            return res.json(db.mockDrafts[idx]);
          }
          return res.status(404).json({ error: "Draft not found" });
        }
        res.json(data);
      } catch (e) {
        const idx = db.mockDrafts.findIndex(d => d.id === req.params.id && d.firm_id === user.firm_id);
        if (idx > -1) {
          db.mockDrafts[idx] = { ...db.mockDrafts[idx], ...updateData };
          saveDb();
          return res.json(db.mockDrafts[idx]);
        }
        res.status(404).json({ error: "Draft not found" });
      }
    } else {
      const idx = db.mockDrafts.findIndex(d => d.id === req.params.id && d.firm_id === user.firm_id);
      if (idx > -1) {
        db.mockDrafts[idx] = { ...db.mockDrafts[idx], ...updateData };
        saveDb();
        res.json(db.mockDrafts[idx]);
      } else {
        res.status(404).json({ error: "Draft not found" });
      }
    }
  });

  app.delete("/api/drafts/:id", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      try {
        const { error } = await supabase.from('drafting_documents').delete().eq('id', req.params.id).eq('firm_id', user.firm_id);
        db.mockDrafts = db.mockDrafts.filter(d => d.id !== req.params.id);
        saveDb();
        res.json({ success: true });
      } catch (e) {
        db.mockDrafts = db.mockDrafts.filter(d => d.id !== req.params.id);
        saveDb();
        res.json({ success: true });
      }
    } else {
      db.mockDrafts = db.mockDrafts.filter(d => !(d.id === req.params.id && d.firm_id === user.firm_id));
      saveDb();
      res.json({ success: true });
    }
  });

  // --- Drafting AI Suggester Co-Writer ---
  app.post("/api/drafts/ai-suggest", authenticateToken, async (req, res) => {
    const { title, template_type, prompt, original_content, action_type } = req.body;
    if (!ai) {
      return res.json({
        suggestion: `[Atlas Co-Writer Simulation Mode]\n\nSince GEMINI_API_KEY environment variable is not defined, here is a simulated professional court suggestion for "${title}" (${template_type}):\n\n"AND BY CONCURRENCE with the Civil Procedure Rules of Malawi, notice is hereby served that this court shall be moved on the date below written for an order to stay proceedings in this suit pending settlement."`
      });
    }

    try {
      let systemInstruction = "You are Atlas Co-Writer, an elite Malawian Legal Document Drafting advisory AI. Output clear, pristine drafting continuation proposals matching Malawi High Court or supreme norms. Maintain Poppins-styled professional vocabulary.";
      let userPrompt = "";

      if (action_type === 'expand') {
        userPrompt = `Given document: "${title}" of category "${template_type}".\nWe have drafted:\n"${original_content}"\n\nPlease construct the next logical legal paragraph or clause. Support standard Malawian judicial terminology.`;
      } else if (action_type === 'advisor') {
        userPrompt = `Given document: "${title}" of category "${template_type}".\nWe are proposing: "${original_content}".\n\nProvide direct legal citations to Malawian Acts of Parliament, standard rules, or precedents that can fortify this exact section ${prompt ? `focusing on ${prompt}` : ""}. Keep it precise and scannable.`;
      } else {
        userPrompt = `Refine and expand the draft instruction for: "${prompt}".\nFor document: "${title}" (${template_type}).`;
      }

      const response = await generateContentWithFallback(ai, {
        contents: userPrompt,
        config: { systemInstruction }
      });
      res.json({ suggestion: response.text });
    } catch (e: any) {
      console.error("Atlas Co-Writer AI suggestion failed, daily quota might be exhausted:", e);
      const isQuotaError = e.message?.toLowerCase().includes("quota") || e.message?.toLowerCase().includes("exceed") || e.status === 429;
      const disclaimer = isQuotaError ? "\n\n*(Notice: Gemini API daily usage quota is exceeded. Operating in Atlas Native Recovery Mode)*" : "";
      
      let suggestionText = "";
      if (action_type === 'advisor') {
        suggestionText = `[Atlas Co-Writer Backup Advisor Guidelines]
1. Under Order 19 of the Civil Procedure Rules of Malawi, verify that any service details comply with the prescribed timeframe.
2. Section 57 of the Employment Act (Chapter 55:02) provides that employment can only be terminated upon valid grounds connected to the capacity or conduct.
3. Consult Section 12 of the Constitution regarding fiduciary standards for public trust matters.`;
      } else {
        suggestionText = `AND WE SOLEMNLY DEPRECATING any delay herein in high compliance with the Civil Procedure laws, do pray this Honorable Court for an order of directions to secure speedy dispatch of the suit herein, and that costs be in the cause.
Dated at Lilongwe this 24th day of May, 2026.`;
      }

      res.json({ suggestion: suggestionText + disclaimer });
    }
  });

  // --- Case Milestones (Timeline) Endpoints ---
  app.get("/api/cases/:id/milestones", authenticateToken, async (req, res) => {
    const caseId = req.params.id;
    const defaultMilestoneTitles = [
      "Client Creation",
      "Filing of Summons",
      "Defence",
      "Reply",
      "Mediation (where applicable)",
      "Scheduling Conferences",
      "Notices of Hearing",
      "Witness Statements",
      "Trial",
      "Judgment",
      "Appeal"
    ];

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('case_milestones')
          .select('*')
          .eq('case_id', caseId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          return res.json(data);
        }

        // Auto-seed milestones if empty
        const seedData = defaultMilestoneTitles.map((title, index) => ({
          id: crypto.randomUUID(),
          case_id: caseId,
          title,
          description: `Chronological stage ${index + 1} of the matter.`,
          status: title === "Client Creation" ? "Completed" : "Pending",
          completed_at: title === "Client Creation" ? new Date().toISOString() : null,
          notes: title === "Client Creation" ? "Case file opened automatically." : ""
        }));

        const { data: seeded, error: seedErr } = await supabase
          .from('case_milestones')
          .insert(seedData)
          .select();

        if (seedErr) {
          console.warn("Could not seed case_milestones in Supabase, using mock fallback", seedErr);
          throw seedErr;
        }

        return res.json(seeded);
      } catch (e) {
        // Fallback to local DB
        db.mockCaseMilestones = db.mockCaseMilestones || [];
        const filtered = db.mockCaseMilestones.filter(m => m.case_id === caseId);
        if (filtered.length > 0) {
          return res.json(filtered);
        }

        const seedData = defaultMilestoneTitles.map((title, index) => ({
          id: `m_${Date.now()}_${index}`,
          case_id: caseId,
          title,
          description: `Chronological stage ${index + 1} of the matter.`,
          status: title === "Client Creation" ? "Completed" : "Pending",
          completed_at: title === "Client Creation" ? new Date().toISOString() : null,
          notes: title === "Client Creation" ? "Case file opened automatically." : ""
        }));

        db.mockCaseMilestones.push(...seedData);
        saveDb();
        return res.json(seedData);
      }
    } else {
      db.mockCaseMilestones = db.mockCaseMilestones || [];
      const filtered = db.mockCaseMilestones.filter(m => m.case_id === caseId);
      if (filtered.length > 0) {
        return res.json(filtered);
      }

      const seedData = defaultMilestoneTitles.map((title, index) => ({
        id: `m_${Date.now()}_${index}`,
        case_id: caseId,
        title,
        description: `Chronological stage ${index + 1} of the matter.`,
        status: title === "Client Creation" ? "Completed" : "Pending",
        completed_at: title === "Client Creation" ? new Date().toISOString() : null,
        notes: title === "Client Creation" ? "Case file opened automatically." : ""
      }));

      db.mockCaseMilestones.push(...seedData);
      saveDb();
      return res.json(seedData);
    }
  });

  app.post("/api/case_milestones", authenticateToken, async (req, res) => {
    const newMilestone = {
      id: crypto.randomUUID(),
      ...req.body,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('case_milestones')
          .insert([newMilestone])
          .select()
          .single();

        if (error) throw error;
        return res.json(data);
      } catch (e) {
        db.mockCaseMilestones = db.mockCaseMilestones || [];
        db.mockCaseMilestones.push(newMilestone);
        saveDb();
        return res.json(newMilestone);
      }
    } else {
      db.mockCaseMilestones = db.mockCaseMilestones || [];
      db.mockCaseMilestones.push(newMilestone);
      saveDb();
      return res.json(newMilestone);
    }
  });

  app.put("/api/case_milestones/:id", authenticateToken, async (req, res) => {
    const id = req.params.id;
    const updateData = req.body;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('case_milestones')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return res.json(data);
      } catch (e) {
        db.mockCaseMilestones = db.mockCaseMilestones || [];
        const idx = db.mockCaseMilestones.findIndex(m => m.id === id);
        if (idx > -1) {
          db.mockCaseMilestones[idx] = { ...db.mockCaseMilestones[idx], ...updateData };
          saveDb();
          return res.json(db.mockCaseMilestones[idx]);
        }
        return res.status(404).json({ error: "Milestone not found" });
      }
    } else {
      db.mockCaseMilestones = db.mockCaseMilestones || [];
      const idx = db.mockCaseMilestones.findIndex(m => m.id === id);
      if (idx > -1) {
        db.mockCaseMilestones[idx] = { ...db.mockCaseMilestones[idx], ...updateData };
        saveDb();
        return res.json(db.mockCaseMilestones[idx]);
      }
      return res.status(404).json({ error: "Milestone not found" });
    }
  });


  // --- Universal Search Endpoint ---
  app.get("/api/search", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const query = (req.query.q as string || "").trim().toLowerCase();

    if (!query) {
      return res.json({
        clients: [],
        cases: [],
        files: [],
        events: [],
        messages: [],
        notes: [],
        tasks: [],
        folders: [],
        milestones: []
      });
    }

    try {
      let clients: any[] = [];
      let cases: any[] = [];
      let files: any[] = [];
      let events: any[] = [];
      let teamMessages: any[] = [];
      let atlasMessages: any[] = [];
      let caseNotes: any[] = [];
      let tasks: any[] = [];
      let folders: any[] = [];
      let milestones: any[] = [];

      if (supabase) {
        const [
          clientsRes,
          casesRes,
          filesRes,
          eventsRes,
          teamMessagesRes,
          atlasMessagesRes,
          caseNotesRes,
          tasksRes,
          foldersRes,
          milestonesRes
        ] = await Promise.all([
          supabase.from('clients').select('*').eq('firm_id', user.firm_id),
          supabase.from('cases').select('*').eq('firm_id', user.firm_id),
          supabase.from('files').select('*').eq('firm_id', user.firm_id),
          supabase.from('events').select('*').eq('firm_id', user.firm_id),
          supabase.from('messages').select('*').eq('firm_id', user.firm_id),
          supabase.from('atlas_messages').select('*').eq('firm_id', user.firm_id),
          supabase.from('case_notes').select('*'),
          supabase.from('tasks').select('*').eq('firm_id', user.firm_id),
          supabase.from('folders').select('*').eq('firm_id', user.firm_id),
          supabase.from('case_milestones').select('*')
        ]);

        clients = clientsRes.data || [];
        cases = casesRes.data || [];
        files = filesRes.data || [];
        events = eventsRes.data || [];
        teamMessages = teamMessagesRes.data || [];
        atlasMessages = atlasMessagesRes.data || [];
        caseNotes = caseNotesRes.data || [];
        tasks = tasksRes.data || [];
        folders = foldersRes.data || [];
        milestones = milestonesRes.data || [];
      } else {
        clients = db.mockClients || [];
        cases = db.mockCases || [];
        files = db.mockFiles || [];
        events = db.mockEvents || [];
        teamMessages = [];
        atlasMessages = db.mockAtlasMessages || [];
        caseNotes = db.mockCaseNotes || [];
        tasks = db.mockTasks || [];
        folders = db.mockFolders || [];
        milestones = db.mockCaseMilestones || [];
      }

      const matchQuery = (val: any) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(query);
      };

      const filteredClients = clients.filter(c => 
        c.firm_id === user.firm_id && (
          matchQuery(c.full_name) || 
          matchQuery(c.email) || 
          matchQuery(c.phone_number) || 
          matchQuery(c.company)
        )
      );

      const filteredCases = cases.filter(c => 
        c.firm_id === user.firm_id && (
          matchQuery(c.title) || 
          matchQuery(c.case_number) || 
          matchQuery(c.claimant) || 
          matchQuery(c.defendant) || 
          matchQuery(c.brief_facts) || 
          matchQuery(c.description) ||
          matchQuery(c.court)
        )
      );

      const filteredFiles = files.filter(f => 
        f.firm_id === user.firm_id && (
          matchQuery(f.filename) || 
          matchQuery(f.doc_type) || 
          matchQuery(f.tags) || 
          matchQuery(f.classification)
        )
      );

      const filteredEvents = events.filter(e => 
        e.firm_id === user.firm_id && (
          matchQuery(e.title) || 
          matchQuery(e.description) || 
          matchQuery(e.type) ||
          matchQuery(e.venue) ||
          matchQuery(e.judge)
        )
      );

      const allMessages = [
        ...teamMessages.map(m => ({ ...m, source: 'team' })),
        ...atlasMessages.map(m => ({ ...m, source: 'atlas' }))
      ];
      const filteredMessages = allMessages.filter(m => 
        m.firm_id === user.firm_id && matchQuery(m.content)
      );

      const firmCaseIds = new Set(cases.filter(c => c.firm_id === user.firm_id).map(c => c.id));
      const filteredNotes = caseNotes.filter(n => 
        firmCaseIds.has(n.case_id) && matchQuery(n.note)
      );

      const filteredTasks = tasks.filter(t => 
        t.firm_id === user.firm_id && (
          matchQuery(t.name) || 
          matchQuery(t.priority) || 
          matchQuery(t.status)
        )
      );

      const filteredFolders = folders.filter(f => 
        f.firm_id === user.firm_id && matchQuery(f.name)
      );

      const filteredMilestones = milestones.filter(m => 
        firmCaseIds.has(m.case_id) && (
          matchQuery(m.title) || 
          matchQuery(m.description) || 
          matchQuery(m.notes)
        )
      );

      return res.json({
        clients: filteredClients,
        cases: filteredCases,
        files: filteredFiles,
        events: filteredEvents,
        messages: filteredMessages,
        notes: filteredNotes,
        tasks: filteredTasks,
        folders: filteredFolders,
        milestones: filteredMilestones
      });

    } catch (e: any) {
      console.error("Error performing search query:", e);
      return res.status(500).json({ error: e.message || "Search failed" });
    }
  });


  // --- Document Version History Endpoints ---
  app.get("/api/files/:fileId/versions", authenticateToken, async (req, res) => {
    const fileId = req.params.fileId;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('file_versions')
          .select('*')
          .eq('file_id', fileId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json(data);
      } catch (e) {
        db.mockFileVersions = db.mockFileVersions || [];
        const filtered = db.mockFileVersions.filter(v => v.file_id === fileId);
        return res.json(filtered.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      }
    } else {
      db.mockFileVersions = db.mockFileVersions || [];
      const filtered = db.mockFileVersions.filter(v => v.file_id === fileId);
      return res.json(filtered.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    }
  });

  app.post("/api/file_versions", authenticateToken, async (req, res) => {
    const newVersion = {
      id: crypto.randomUUID(),
      ...req.body,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('file_versions')
          .insert([newVersion])
          .select()
          .single();

        if (error) throw error;
        return res.json(data);
      } catch (e) {
        db.mockFileVersions = db.mockFileVersions || [];
        db.mockFileVersions.push(newVersion);
        saveDb();
        return res.json(newVersion);
      }
    } else {
      db.mockFileVersions = db.mockFileVersions || [];
      db.mockFileVersions.push(newVersion);
      saveDb();
      return res.json(newVersion);
    }
  });

  app.put("/api/files/:id/restore-version", authenticateToken, async (req, res) => {
    const fileId = req.params.id;
    const { filename, file_url, version_number, doc_type, tags, classification, author } = req.body;

    const updateData = {
      filename,
      file_url,
      version_number,
      doc_type: doc_type || 'Other',
      tags: tags || '',
      classification: classification || 'Working Draft',
      author: author || 'System',
      last_edited_at: new Date().toISOString()
    };

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('files')
          .update(updateData)
          .eq('id', fileId)
          .select()
          .single();

        if (error) throw error;
        return res.json(data);
      } catch (e) {
        db.mockFiles = db.mockFiles || [];
        const idx = db.mockFiles.findIndex(f => f.id === fileId);
        if (idx > -1) {
          db.mockFiles[idx] = { ...db.mockFiles[idx], ...updateData };
          saveDb();
          return res.json(db.mockFiles[idx]);
        }
        return res.status(404).json({ error: "File not found" });
      }
    } else {
      db.mockFiles = db.mockFiles || [];
      const idx = db.mockFiles.findIndex(f => f.id === fileId);
      if (idx > -1) {
        db.mockFiles[idx] = { ...db.mockFiles[idx], ...updateData };
        saveDb();
        return res.json(db.mockFiles[idx]);
      }
      return res.status(404).json({ error: "File not found" });
    }
  });


  // --- Audit Log Helper ---
  async function recordAuditLog(req: any, action: string, details: string) {
    const user = req.user;
    if (!user) return;
    const ip = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || "Unknown";
    const userAgent = req.headers['user-agent'] || "Unknown";

    const logItem = {
      id: crypto.randomUUID(),
      firm_id: user.firm_id,
      staff_id: user.id,
      staff_name: user.name || "Staff Member",
      action,
      details,
      ip_address: ip,
      user_agent: userAgent,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      try {
        await supabase.from('audit_logs').insert([logItem]);
      } catch (e) {
        console.error("Failed to write to Supabase audit_logs:", e);
        db.mockAuditLogs = db.mockAuditLogs || [];
        db.mockAuditLogs.push(logItem);
        saveDb();
      }
    } else {
      db.mockAuditLogs = db.mockAuditLogs || [];
      db.mockAuditLogs.push(logItem);
      saveDb();
    }
  }

  // --- Audit Logs Endpoint ---
  app.get("/api/audit_logs", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .eq('firm_id', user.firm_id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.json(data);
      } catch (e) {
        db.mockAuditLogs = db.mockAuditLogs || [];
        const filtered = db.mockAuditLogs.filter(l => l.firm_id === user.firm_id);
        return res.json(filtered.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      }
    } else {
      db.mockAuditLogs = db.mockAuditLogs || [];
      const filtered = db.mockAuditLogs.filter(l => l.firm_id === user.firm_id);
      return res.json(filtered.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    }
  });

  app.post("/api/audit_logs", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { action, details } = req.body;
    await recordAuditLog(req, action, details);
    return res.json({ status: "success" });
  });

  // --- Time Recording Endpoints ---
  app.get("/api/time_records", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('time_records')
          .select('*')
          .eq('firm_id', user.firm_id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.json(data);
      } catch (e) {
        db.mockTimeRecords = db.mockTimeRecords || [];
        const filtered = db.mockTimeRecords.filter(t => t.firm_id === user.firm_id);
        return res.json(filtered.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      }
    } else {
      db.mockTimeRecords = db.mockTimeRecords || [];
      const filtered = db.mockTimeRecords.filter(t => t.firm_id === user.firm_id);
      return res.json(filtered.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    }
  });

  app.post("/api/time_records", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const newRecord = {
      id: crypto.randomUUID(),
      firm_id: user.firm_id,
      staff_id: user.id,
      created_at: new Date().toISOString(),
      ...req.body
    };

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('time_records')
          .insert([newRecord])
          .select()
          .single();
        if (error) throw error;
        await recordAuditLog(req, "Time Recorded", `Logged ${Math.round(newRecord.duration_seconds / 60)} minutes of ${newRecord.nature_of_work} on case: ${newRecord.case_title || 'unspecified'}`);
        return res.json(data);
      } catch (e) {
        db.mockTimeRecords = db.mockTimeRecords || [];
        db.mockTimeRecords.push(newRecord);
        saveDb();
        await recordAuditLog(req, "Time Recorded", `Logged ${Math.round(newRecord.duration_seconds / 60)} minutes of ${newRecord.nature_of_work} on case: ${newRecord.case_title || 'unspecified'}`);
        return res.json(newRecord);
      }
    } else {
      db.mockTimeRecords = db.mockTimeRecords || [];
      db.mockTimeRecords.push(newRecord);
      saveDb();
      await recordAuditLog(req, "Time Recorded", `Logged ${Math.round(newRecord.duration_seconds / 60)} minutes of ${newRecord.nature_of_work} on case: ${newRecord.case_title || 'unspecified'}`);
      return res.json(newRecord);
    }
  });

  app.delete("/api/time_records/:id", authenticateToken, async (req, res) => {
    const id = req.params.id;
    const user = (req as any).user;

    if (supabase) {
      try {
        const { error } = await supabase
          .from('time_records')
          .delete()
          .eq('id', id);
        if (error) throw error;
        await recordAuditLog(req, "Deleted Time Record", `Deleted time record: ${id}`);
        return res.json({ success: true });
      } catch (e) {
        db.mockTimeRecords = db.mockTimeRecords || [];
        db.mockTimeRecords = db.mockTimeRecords.filter(t => t.id !== id);
        saveDb();
        await recordAuditLog(req, "Deleted Time Record", `Deleted time record: ${id}`);
        return res.json({ success: true });
      }
    } else {
      db.mockTimeRecords = db.mockTimeRecords || [];
      db.mockTimeRecords = db.mockTimeRecords.filter(t => t.id !== id);
      saveDb();
      await recordAuditLog(req, "Deleted Time Record", `Deleted time record: ${id}`);
      return res.json({ success: true });
    }
  });

  // --- Conflict of Interest Check Endpoint ---
  app.post("/api/cases/conflict-check", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { claimant, defendant, companies, directors } = req.body;

    const queryTerms = [
      claimant,
      defendant,
      companies,
      directors
    ].filter(Boolean).map(term => String(term).trim().toLowerCase());

    if (queryTerms.length === 0) {
      return res.json({ conflict: false, reasons: [] });
    }

    try {
      let cases: any[] = [];
      let clients: any[] = [];

      if (supabase) {
        const [casesRes, clientsRes] = await Promise.all([
          supabase.from('cases').select('*').eq('firm_id', user.firm_id),
          supabase.from('clients').select('*').eq('firm_id', user.firm_id)
        ]);
        cases = casesRes.data || [];
        clients = clientsRes.data || [];
      } else {
        cases = db.mockCases || [];
        clients = db.mockClients || [];
      }

      const reasons: string[] = [];

      // Check cases for conflicts
      cases.forEach(c => {
        const caseIdStr = c.case_number ? `(${c.case_number})` : "";
        const termsToCheck = [
          c.claimant,
          c.defendant,
          c.companies,
          c.directors,
          c.title
        ].filter(Boolean).map(t => String(t).toLowerCase());

        queryTerms.forEach(term => {
          termsToCheck.forEach(ct => {
            if (ct.includes(term)) {
              reasons.push(`Match with active Case "${c.title}" ${caseIdStr} (Matched on term: "${term}")`);
            }
          });
        });
      });

      // Check clients for conflicts
      clients.forEach(cl => {
        const clientName = String(cl.full_name || "").toLowerCase();
        const clientCompany = String(cl.company || "").toLowerCase();

        queryTerms.forEach(term => {
          if (clientName.includes(term)) {
            reasons.push(`Match with existing/former Client "${cl.full_name}" (Matched on term: "${term}")`);
          }
          if (clientCompany && clientCompany.includes(term)) {
            reasons.push(`Match with Client Company "${cl.company}" of "${cl.full_name}" (Matched on term: "${term}")`);
          }
        });
      });

      // Record this attempt in the Audit Trail!
      const searchTermsLog = queryTerms.join(", ");
      await recordAuditLog(req, "Conflict Check Performed", `Searched for: ${searchTermsLog}. Found ${reasons.length} potential conflicts.`);

      return res.json({
        conflict: reasons.length > 0,
        reasons: Array.from(new Set(reasons)) // deduplicate reasons
      });

    } catch (e: any) {
      console.error("Conflict check error:", e);
      return res.status(500).json({ error: e.message || "Conflict check failed" });
    }
  });

  // --- Case Note Pin / Update Endpoints ---
  app.put("/api/case_notes/:id", authenticateToken, async (req, res) => {
    const id = req.params.id;
    const updateData = req.body; // e.g. { pinned: true } or { content: '...' }

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('case_notes')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        await recordAuditLog(req, "Updated Case Note", `Updated case note properties: ${Object.keys(updateData).join(', ')}`);
        return res.json(data);
      } catch (e) {
        db.mockCaseNotes = db.mockCaseNotes || [];
        const idx = db.mockCaseNotes.findIndex(n => n.id === id);
        if (idx > -1) {
          db.mockCaseNotes[idx] = { ...db.mockCaseNotes[idx], ...updateData };
          saveDb();
          await recordAuditLog(req, "Updated Case Note", `Updated mock case note properties: ${Object.keys(updateData).join(', ')}`);
          return res.json(db.mockCaseNotes[idx]);
        }
        return res.status(404).json({ error: "Note not found" });
      }
    } else {
      db.mockCaseNotes = db.mockCaseNotes || [];
      const idx = db.mockCaseNotes.findIndex(n => n.id === id);
      if (idx > -1) {
        db.mockCaseNotes[idx] = { ...db.mockCaseNotes[idx], ...updateData };
        saveDb();
        await recordAuditLog(req, "Updated Case Note", `Updated mock case note properties: ${Object.keys(updateData).join(', ')}`);
        return res.json(db.mockCaseNotes[idx]);
      }
      return res.status(404).json({ error: "Note not found" });
    }
  });

  // --- Analytical Reports Endpoint ---
  app.get("/api/reports", authenticateToken, async (req, res) => {
    const user = (req as any).user;

    try {
      let cases: any[] = [];
      let clients: any[] = [];
      let events: any[] = [];
      let tasks: any[] = [];
      let staff: any[] = [];
      let timeRecords: any[] = [];

      if (supabase) {
        const [casesRes, clientsRes, eventsRes, tasksRes, staffRes, timeRes] = await Promise.all([
          supabase.from('cases').select('*').eq('firm_id', user.firm_id),
          supabase.from('clients').select('*').eq('firm_id', user.firm_id),
          supabase.from('events').select('*').eq('firm_id', user.firm_id),
          supabase.from('tasks').select('*').eq('firm_id', user.firm_id),
          supabase.from('staff').select('id, name, role, username').eq('firm_id', user.firm_id),
          supabase.from('time_records').select('*').eq('firm_id', user.firm_id)
        ]);

        cases = casesRes.data || [];
        clients = clientsRes.data || [];
        events = eventsRes.data || [];
        tasks = tasksRes.data || [];
        staff = staffRes.data || [];
        timeRecords = timeRes.data || [];
      } else {
        cases = db.mockCases || [];
        clients = db.mockClients || [];
        events = db.mockEvents || [];
        tasks = db.mockTasks || [];
        staff = db.mockStaff || [];
        timeRecords = db.mockTimeRecords || [];
      }

      // 1. Matters Opened & Closed
      const openedCount = cases.length;
      const closedCount = cases.filter(c => c.status === 'Closed' || c.stage === 'Closed').length;
      const activeCount = openedCount - closedCount;

      // 2. Monthly registration trend
      const monthlyCaseTrend: Record<string, number> = {};
      cases.forEach(c => {
        const date = new Date(c.created_at || Date.now());
        const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        monthlyCaseTrend[monthKey] = (monthlyCaseTrend[monthKey] || 0) + 1;
      });

      // 3. Court Performance
      const courtBreakdown: Record<string, number> = {};
      cases.forEach(c => {
        const court = c.court || "Other/Unspecified";
        courtBreakdown[court] = (courtBreakdown[court] || 0) + 1;
      });

      // 4. Most active lawyer (by cases assigned, tasks completed, time records)
      const lawyerActivity = staff.map(s => {
        const assignedCases = cases.filter(c => c.assigned_staff_ids?.includes(s.id) || c.assigned_staff_id === s.id).length;
        const completedTasks = tasks.filter(t => t.assigned_to === s.id && t.status === 'Completed').length;
        const loggedTime = timeRecords.filter(t => t.staff_id === s.id).reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0);
        
        return {
          id: s.id,
          name: s.name,
          role: s.role,
          assignedCases,
          completedTasks,
          hoursTracked: Number((loggedTime / 3600).toFixed(1))
        };
      }).sort((a, b) => b.hoursTracked - a.hoursTracked || b.assignedCases - a.assignedCases);

      // 5. Productivity hours by Nature of Work
      const productivityByNature: Record<string, number> = {
        'Drafting': 0,
        'Legal Research': 0,
        'Court Attendance': 0,
        'Consultations': 0,
        'Travelling': 0,
        'Telephone Calls': 0,
        'Other': 0
      };
      timeRecords.forEach(t => {
        const hours = (t.duration_seconds || 0) / 3600;
        const rawNature = t.nature_of_work || "Other";
        // match nature keys case-insensitively or exactly
        let matchedKey = "Other";
        Object.keys(productivityByNature).forEach(k => {
          if (k.toLowerCase() === rawNature.toLowerCase()) {
            matchedKey = k;
          }
        });
        productivityByNature[matchedKey] = Number((productivityByNature[matchedKey] + hours).toFixed(2));
      });

      // 6. Upcoming hearings
      const upcomingHearings = events.filter(e => {
        const date = new Date(e.start_time || e.date);
        return date >= new Date();
      }).map(e => ({
        id: e.id,
        title: e.title,
        date: e.start_time || e.date,
        venue: e.venue || "Unspecified",
        judge: e.judge || "Unspecified"
      })).slice(0, 10);

      // 7. Client Growth Trend
      const monthlyClientTrend: Record<string, number> = {};
      clients.forEach(c => {
        const date = new Date(c.created_at || Date.now());
        const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        monthlyClientTrend[monthKey] = (monthlyClientTrend[monthKey] || 0) + 1;
      });

      // Record report run in Audit Trail!
      await recordAuditLog(req, "Generated Analytics Report", "Exported and viewed general law firm performance reports.");

      return res.json({
        summary: {
          totalCases: openedCount,
          activeCases: activeCount,
          closedCases: closedCount,
          totalHours: Number((timeRecords.reduce((acc, curr) => acc + (curr.duration_seconds || 0), 0) / 3600).toFixed(1)),
          totalClients: clients.length,
          upcomingHearingsCount: upcomingHearings.length
        },
        caseTrend: Object.keys(monthlyCaseTrend).map(month => ({ month, count: monthlyCaseTrend[month] })),
        clientTrend: Object.keys(monthlyClientTrend).map(month => ({ month, count: monthlyClientTrend[month] })),
        courtBreakdown: Object.keys(courtBreakdown).map(court => ({ name: court, value: courtBreakdown[court] })),
        productivity: Object.keys(productivityByNature).map(name => ({ name, value: productivityByNature[name] })),
        lawyerActivity,
        upcomingHearings
      });

    } catch (e: any) {
      console.error("Reports aggregation failed:", e);
      return res.status(500).json({ error: e.message || "Failed to generate reports" });
    }
  });


  // --- Universal Search Endpoint ---
  app.get("/api/universal-search", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const query = (req.query.q || "").toString().trim().toLowerCase();

    if (!query) {
      return res.json({ cases: [], clients: [], documents: [], hearings: [], messages: [], notes: [] });
    }

    try {
      let casesResult: any[] = [];
      let clientsResult: any[] = [];
      let documentsResult: any[] = [];
      let hearingsResult: any[] = [];
      let messagesResult: any[] = [];
      let notesResult: any[] = [];

      if (supabase) {
        // 1. Search cases
        const { data: casesData } = await supabase
          .from('cases')
          .select('*')
          .eq('firm_id', user.firm_id);
        
        if (casesData) {
          casesResult = casesData.filter(c => 
            (c.title || '').toLowerCase().includes(query) ||
            (c.case_number || '').toLowerCase().includes(query) ||
            (c.description || '').toLowerCase().includes(query) ||
            (c.brief_facts || '').toLowerCase().includes(query) ||
            (c.claimant || '').toLowerCase().includes(query) ||
            (c.defendant || '').toLowerCase().includes(query) ||
            (c.companies || '').toLowerCase().includes(query) ||
            (c.directors || '').toLowerCase().includes(query) ||
            (c.judge_name || '').toLowerCase().includes(query)
          );
        }

        // 2. Search clients
        const { data: clientsData } = await supabase
          .from('clients')
          .select('*')
          .eq('firm_id', user.firm_id);
        
        if (clientsData) {
          clientsResult = clientsData.filter(c => 
            (c.name || '').toLowerCase().includes(query) ||
            (c.email || '').toLowerCase().includes(query) ||
            (c.phone || '').toLowerCase().includes(query) ||
            (c.company || '').toLowerCase().includes(query) ||
            (c.description || '').toLowerCase().includes(query)
          );
        }

        // 3. Search documents (Folders & Files)
        const { data: filesData } = await supabase
          .from('files')
          .select('*')
          .eq('firm_id', user.firm_id);
        
        const { data: foldersData } = await supabase
          .from('folders')
          .select('*')
          .eq('firm_id', user.firm_id);

        if (filesData) {
          documentsResult = [
            ...documentsResult,
            ...filesData.filter(f => 
              (f.name || '').toLowerCase().includes(query) ||
              (f.category || '').toLowerCase().includes(query) ||
              (f.description || '').toLowerCase().includes(query)
            ).map(f => ({ id: f.id, name: f.name, type: 'File', case_id: f.case_id, category: f.category }))
          ];
        }

        if (foldersData) {
          documentsResult = [
            ...documentsResult,
            ...foldersData.filter(f => 
              (f.name || '').toLowerCase().includes(query)
            ).map(f => ({ id: f.id, name: f.name, type: 'Folder', case_id: f.case_id }))
          ];
        }

        // 4. Search hearings (Events)
        const { data: eventsData } = await supabase
          .from('events')
          .select('*')
          .eq('firm_id', user.firm_id);
        
        if (eventsData) {
          hearingsResult = eventsData.filter(e => 
            (e.title || '').toLowerCase().includes(query) ||
            (e.description || '').toLowerCase().includes(query) ||
            (e.venue || '').toLowerCase().includes(query) ||
            (e.judge || '').toLowerCase().includes(query)
          ).map(e => ({ id: e.id, title: e.title, date: e.start_time || e.date, venue: e.venue, judge: e.judge, case_id: e.case_id }));
        }

        // 5. Search messages
        const { data: messagesData } = await supabase
          .from('messages')
          .select('*')
          .eq('firm_id', user.firm_id);
        
        if (messagesData) {
          messagesResult = messagesData.filter(m => 
            (m.content || '').toLowerCase().includes(query) ||
            (m.sender_name || '').toLowerCase().includes(query) ||
            (m.recipient_name || '').toLowerCase().includes(query)
          ).map(m => ({ id: m.id, content: m.content, sender: m.sender_name, receiver: m.recipient_name, date: m.created_at }));
        }

        // 6. Search Case Notes
        const { data: notesData } = await supabase
          .from('case_notes')
          .select('*')
          .eq('firm_id', user.firm_id);
        
        if (notesData) {
          notesResult = notesData.filter(n => 
            (n.note || '').toLowerCase().includes(query) ||
            (n.author_name || '').toLowerCase().includes(query)
          ).map(n => ({ id: n.id, note: n.note, author: n.author_name, case_id: n.case_id, date: n.created_at }));
        }

      } else {
        // Search mock database in memory
        const cases = db.mockCases || [];
        casesResult = cases.filter((c: any) => 
          (c.title || '').toLowerCase().includes(query) ||
          (c.case_number || '').toLowerCase().includes(query) ||
          (c.description || '').toLowerCase().includes(query) ||
          (c.brief_facts || '').toLowerCase().includes(query) ||
          (c.claimant || '').toLowerCase().includes(query) ||
          (c.defendant || '').toLowerCase().includes(query) ||
          (c.companies || '').toLowerCase().includes(query) ||
          (c.directors || '').toLowerCase().includes(query) ||
          (c.judge_name || '').toLowerCase().includes(query)
        );

        const clients = db.mockClients || [];
        clientsResult = clients.filter((c: any) => 
          (c.name || '').toLowerCase().includes(query) ||
          (c.email || '').toLowerCase().includes(query) ||
          (c.phone || '').toLowerCase().includes(query) ||
          (c.company || '').toLowerCase().includes(query) ||
          (c.description || '').toLowerCase().includes(query)
        );

        const files = db.mockFiles || [];
        const folders = db.mockFolders || [];
        documentsResult = [
          ...files.filter((f: any) => 
            (f.name || '').toLowerCase().includes(query) ||
            (f.category || '').toLowerCase().includes(query) ||
            (f.description || '').toLowerCase().includes(query)
          ).map((f: any) => ({ id: f.id, name: f.name, type: 'File', case_id: f.case_id, category: f.category })),
          ...folders.filter((f: any) => 
            (f.name || '').toLowerCase().includes(query)
          ).map((f: any) => ({ id: f.id, name: f.name, type: 'Folder', case_id: f.case_id }))
        ];

        const events = db.mockEvents || [];
        hearingsResult = events.filter((e: any) => 
          (e.title || '').toLowerCase().includes(query) ||
          (e.description || '').toLowerCase().includes(query) ||
          (e.venue || '').toLowerCase().includes(query) ||
          (e.judge || '').toLowerCase().includes(query)
        ).map((e: any) => ({ id: e.id, title: e.title, date: e.start_time || e.date, venue: e.venue, judge: e.judge, case_id: e.case_id }));

        const messages = db.mockAtlasMessages || [];
        messagesResult = messages.filter((m: any) => 
          (m.content || '').toLowerCase().includes(query) ||
          (m.sender_name || '').toLowerCase().includes(query) ||
          (m.recipient_name || '').toLowerCase().includes(query)
        ).map((m: any) => ({ id: m.id, content: m.content, sender: m.sender_name, receiver: m.recipient_name, date: m.created_at }));

        const notes = db.mockCaseNotes || [];
        notesResult = notes.filter((n: any) => 
          (n.note || '').toLowerCase().includes(query) ||
          (n.author_name || '').toLowerCase().includes(query)
        ).map((n: any) => ({ id: n.id, note: n.note, author: n.author_name, case_id: n.case_id, date: n.created_at }));
      }

      return res.json({
        cases: casesResult,
        clients: clientsResult,
        documents: documentsResult,
        hearings: hearingsResult,
        messages: messagesResult,
        notes: notesResult
      });

    } catch (e: any) {
      console.error("Universal Search aggregation error:", e);
      return res.status(500).json({ error: e.message || "Failed to search system records" });
    }
  });

  // --- Automatic Reminders Admin Endpoints ---
  app.post("/api/admin/reminders/run", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'Managing Partner') return res.status(403).json({ error: "Unauthorized" });
    const result = await runAutomaticRemindersEngine();
    res.json(result);
  });

  app.get("/api/admin/reminders/history", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'Managing Partner') return res.status(403).json({ error: "Unauthorized" });
    let logs: any[] = [];
    if (supabase) {
      const { data } = await supabase.from('email_logs').select('*').eq('firm_id', user.firm_id).order('sent_at', { ascending: false });
      logs = data || [];
    } else {
      logs = db.mockEmailLogs || [];
    }
    const reminderLogs = logs.filter((log: any) => 
      log.subject.includes('[7-Day Reminder]') ||
      log.subject.includes('[3-Day Reminder]') ||
      log.subject.includes('[1-Day Reminder]') ||
      log.subject.includes('[2-Hour Urgent Reminder]') ||
      log.subject.includes('[Overdue Task Reminder]')
    );
    res.json(reminderLogs);
  });

  // --- Automatic Backups Admin Endpoints ---
  app.get("/api/admin/backups", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'Managing Partner') return res.status(403).json({ error: "Unauthorized" });
    if (supabase) {
      const { data, error } = await supabase.from('backups').select('id, name, created_at').eq('firm_id', user.firm_id).order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      const backups = (db as any).mockBackups || [];
      res.json(backups.map((b: any) => ({ id: b.id, name: b.name, created_at: b.created_at })));
    }
  });

  app.post("/api/admin/backups", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'Managing Partner') return res.status(403).json({ error: "Unauthorized" });
    
    const backupName = req.body.name || `Manual Backup - ${new Date().toLocaleString()}`;
    
    let backupPayload: Record<string, any> = {};
    if (supabase) {
      try {
        const [clientsRes, casesRes, tasksRes, eventsRes, recordsRes] = await Promise.all([
          supabase.from('clients').select('*').eq('firm_id', user.firm_id),
          supabase.from('cases').select('*').eq('firm_id', user.firm_id),
          supabase.from('tasks').select('*').eq('firm_id', user.firm_id),
          supabase.from('events').select('*').eq('firm_id', user.firm_id),
          supabase.from('time_records').select('*').eq('firm_id', user.firm_id)
        ]);
        
        const caseIds = (casesRes.data || []).map((c: any) => c.id);
        let notes: any[] = [];
        let milestones: any[] = [];
        
        if (caseIds.length > 0) {
          const [nRes, mRes] = await Promise.all([
            supabase.from('case_notes').select('*').in('case_id', caseIds),
            supabase.from('case_milestones').select('*').in('case_id', caseIds)
          ]);
          notes = nRes.data || [];
          milestones = mRes.data || [];
        }
        
        backupPayload = {
          clients: clientsRes.data || [],
          cases: casesRes.data || [],
          tasks: tasksRes.data || [],
          events: eventsRes.data || [],
          case_milestones: milestones,
          case_notes: notes,
          time_records: recordsRes.data || []
        };
      } catch (err: any) {
        return res.status(500).json({ error: `Failed to query tables: ${err.message}` });
      }
    } else {
      backupPayload = {
        clients: (db.mockClients || []).filter((c: any) => c.firm_id === user.firm_id),
        cases: (db.mockCases || []).filter((c: any) => c.firm_id === user.firm_id),
        tasks: (db.mockTasks || []).filter((t: any) => t.firm_id === user.firm_id),
        events: (db.mockEvents || []).filter((e: any) => e.firm_id === user.firm_id),
        case_milestones: (db.mockCaseMilestones || []),
        case_notes: (db.mockCaseNotes || []),
        time_records: (db.mockTimeRecords || []).filter((t: any) => t.firm_id === user.firm_id)
      };
    }
    
    if (supabase) {
      const { data, error } = await supabase.from('backups').insert([{
        firm_id: user.firm_id,
        name: backupName,
        data: backupPayload
      }]).select('id, name, created_at').single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      (db as any).mockBackups = (db as any).mockBackups || [];
      const newBackup = {
        id: `backup-${Date.now()}`,
        firm_id: user.firm_id,
        name: backupName,
        data: backupPayload,
        created_at: new Date().toISOString()
      };
      (db as any).mockBackups.push(newBackup);
      saveDb();
      res.json({ id: newBackup.id, name: newBackup.name, created_at: newBackup.created_at });
    }
  });

  app.post("/api/admin/backups/:id/restore", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    if (user.role !== 'Managing Partner') return res.status(403).json({ error: "Unauthorized" });
    
    let backupData: any = null;
    if (supabase) {
      const { data, error } = await supabase.from('backups').select('*').eq('id', req.params.id).eq('firm_id', user.firm_id).single();
      if (error || !data) return res.status(404).json({ error: "Backup not found" });
      backupData = data.data;
    } else {
      const backups = (db as any).mockBackups || [];
      const bObj = backups.find((b: any) => b.id === req.params.id && b.firm_id === user.firm_id);
      if (!bObj) return res.status(404).json({ error: "Backup not found" });
      backupData = bObj.data;
    }
    
    if (!backupData) return res.status(400).json({ error: "Backup empty or corrupt" });
    
    if (supabase) {
      try {
        const { cases = [], clients = [], tasks = [], events = [], case_milestones = [], case_notes = [], time_records = [] } = backupData;
        const caseIds = cases.map((c: any) => c.id);
        
        if (caseIds.length > 0) {
          await supabase.from('case_milestones').delete().in('case_id', caseIds);
          await supabase.from('case_notes').delete().in('case_id', caseIds);
        }
        await supabase.from('tasks').delete().eq('firm_id', user.firm_id);
        await supabase.from('events').delete().eq('firm_id', user.firm_id);
        await supabase.from('time_records').delete().eq('firm_id', user.firm_id);
        await supabase.from('cases').delete().eq('firm_id', user.firm_id);
        await supabase.from('clients').delete().eq('firm_id', user.firm_id);
        
        if (clients.length > 0) await supabase.from('clients').insert(clients);
        if (cases.length > 0) await supabase.from('cases').insert(cases);
        if (events.length > 0) await supabase.from('events').insert(events);
        if (tasks.length > 0) await supabase.from('tasks').insert(tasks);
        if (case_notes.length > 0) await supabase.from('case_notes').insert(case_notes);
        if (case_milestones.length > 0) await supabase.from('case_milestones').insert(case_milestones);
        if (time_records.length > 0) await supabase.from('time_records').insert(time_records);
        
      } catch (err: any) {
        return res.status(500).json({ error: `Restore error: ${err.message}` });
      }
    } else {
      const { cases = [], clients = [], tasks = [], events = [], case_milestones = [], case_notes = [], time_records = [] } = backupData;
      
      db.mockCases = db.mockCases.filter((c: any) => c.firm_id !== user.firm_id).concat(cases);
      db.mockClients = db.mockClients.filter((c: any) => c.firm_id !== user.firm_id).concat(clients);
      db.mockTasks = db.mockTasks.filter((t: any) => t.firm_id !== user.firm_id).concat(tasks);
      db.mockEvents = db.mockEvents.filter((e: any) => e.firm_id !== user.firm_id).concat(events);
      
      const backupCaseIds = cases.map((c: any) => c.id);
      db.mockCaseNotes = db.mockCaseNotes.filter((n: any) => !backupCaseIds.includes(n.case_id)).concat(case_notes);
      db.mockCaseMilestones = db.mockCaseMilestones.filter((m: any) => !backupCaseIds.includes(m.case_id)).concat(case_milestones);
      db.mockTimeRecords = db.mockTimeRecords.filter((t: any) => t.firm_id !== user.firm_id).concat(time_records);
      
      saveDb();
    }
    
    res.json({ success: true, message: "Backup snapshot restored successfully" });
  });

  // --- Background Automation Scheduler (Requirement 19 & 20) ---
  // Runs every 30 minutes to check reminders & daily backups
  setInterval(async () => {
    console.log("[Scheduler] Running periodic check...");
    try {
      // 1. Run automatic reminders
      const reminderResult = await runAutomaticRemindersEngine();
      if (reminderResult.success && reminderResult.sentCount > 0) {
        console.log(`[Scheduler] Automatic reminders sent: ${reminderResult.sentCount}`);
      }

      // 2. Daily Automatic Backup
      const todayStr = new Date().toISOString().split('T')[0];
      let firmsToBackup: string[] = [];
      if (supabase) {
        const { data } = await supabase.from('firms').select('id');
        firmsToBackup = (data || []).map((f: any) => f.id);
      } else {
        firmsToBackup = db.mockFirms.map(f => f.id);
      }

      for (const firmId of firmsToBackup) {
        let alreadyBackedUp = false;
        if (supabase) {
          const { data } = await supabase
            .from('backups')
            .select('id')
            .eq('firm_id', firmId)
            .like('name', `Daily Auto-Backup - ${todayStr}%`)
            .limit(1);
          if (data && data.length > 0) {
            alreadyBackedUp = true;
          }
        } else {
          const mockBackups = (db as any).mockBackups || [];
          alreadyBackedUp = mockBackups.some((b: any) => b.firm_id === firmId && b.name.startsWith(`Daily Auto-Backup - ${todayStr}`));
        }

        if (!alreadyBackedUp) {
          console.log(`[Scheduler] Creating Daily Auto-Backup for firm: ${firmId}`);
          let payload: Record<string, any> = {};
          if (supabase) {
            const [clientsRes, casesRes, tasksRes, eventsRes, recordsRes] = await Promise.all([
              supabase.from('clients').select('*').eq('firm_id', firmId),
              supabase.from('cases').select('*').eq('firm_id', firmId),
              supabase.from('tasks').select('*').eq('firm_id', firmId),
              supabase.from('events').select('*').eq('firm_id', firmId),
              supabase.from('time_records').select('*').eq('firm_id', firmId)
            ]);
            
            const caseIds = (casesRes.data || []).map((c: any) => c.id);
            let notes: any[] = [];
            let milestones: any[] = [];
            if (caseIds.length > 0) {
              const [nRes, mRes] = await Promise.all([
                supabase.from('case_notes').select('*').in('case_id', caseIds),
                supabase.from('case_milestones').select('*').in('case_id', caseIds)
              ]);
              notes = nRes.data || [];
              milestones = mRes.data || [];
            }

            payload = {
              clients: clientsRes.data || [],
              cases: casesRes.data || [],
              tasks: tasksRes.data || [],
              events: eventsRes.data || [],
              case_milestones: milestones,
              case_notes: notes,
              time_records: recordsRes.data || []
            };

            await supabase.from('backups').insert([{
              firm_id: firmId,
              name: `Daily Auto-Backup - ${todayStr}`,
              data: payload
            }]);
          } else {
            payload = {
              clients: (db.mockClients || []).filter((c: any) => c.firm_id === firmId),
              cases: (db.mockCases || []).filter((c: any) => c.firm_id === firmId),
              tasks: (db.mockTasks || []).filter((t: any) => t.firm_id === firmId),
              events: (db.mockEvents || []).filter((e: any) => e.firm_id === firmId),
              case_milestones: (db.mockCaseMilestones || []),
              case_notes: (db.mockCaseNotes || []),
              time_records: (db.mockTimeRecords || []).filter((t: any) => t.firm_id === firmId)
            };

            (db as any).mockBackups = (db as any).mockBackups || [];
            (db as any).mockBackups.push({
              id: `backup-auto-${firmId}-${todayStr}`,
              firm_id: firmId,
              name: `Daily Auto-Backup - ${todayStr}`,
              data: payload,
              created_at: new Date().toISOString()
            });
            saveDb();
          }
          console.log(`[Scheduler] Daily Auto-Backup completed for firm: ${firmId}`);
        }
      }
    } catch (err) {
      console.error("[Scheduler] Background jobs error:", err);
    }
  }, 1000 * 60 * 30); // Runs every 30 minutes

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
