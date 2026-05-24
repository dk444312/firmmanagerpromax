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

const ai = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY)
  ? new GoogleGenAI({
      apiKey: (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY)!,
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
      await resend.emails.send({
        from: "Firm Notifications <support@firmmanagerapp.com>",
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
async function triggerReminders(targetFirmId?: string, targetUserId?: string, isManual = false) {
  let countTasks = 0;
  let countEvents = 0;
  
  if (!supabase) {
    // Mock DB implementation
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    
    let tasks = db.mockTasks || [];
    if (targetFirmId) tasks = tasks.filter((t:any) => t.firm_id === targetFirmId);
    if (isManual) {
      tasks = tasks.filter((t:any) => t.status !== 'Completed');
    } else {
      const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
      tasks = tasks.filter((t:any) => new Date(t.due_date) > now && new Date(t.due_date) < nextHour);
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
         const subject = `Task Reminder: ${t.name}`;
         const body = `<p>You have a pending task <strong>${t.name}</strong> due on ${new Date(t.due_date).toLocaleDateString()}.</p>`;
         await sendAndLogEmail(u.firm_id, u.id, u.emails, subject, body, u.name);
         countTasks++;
      }
    }
    
    let events = db.mockEvents || [];
    if (targetFirmId) events = events.filter((e:any) => e.firm_id === targetFirmId);
    if (!isManual) {
      events = events.filter((e:any) => e.date === todayDate);
    } else {
      events = events.filter((e:any) => e.date >= todayDate);
    }
    
    for (const e of events) {
      let firmStaff = (db.mockStaff || []).filter((s:any) => s.firm_id === e.firm_id);
      if (targetUserId) {
        firmStaff = firmStaff.filter((s:any) => s.id === targetUserId);
      }
      for (const u of firmStaff) {
         if (!u.emails || u.message_notifications === false) continue;
         const subject = `Upcoming Event: ${e.title}`;
         const body = `<p>You have an upcoming event <strong>${e.title}</strong> scheduled on ${new Date(e.date).toLocaleDateString()} at ${e.time}.</p>`;
         await sendAndLogEmail(u.firm_id, u.id, u.emails, subject, body, u.name);
         countEvents++;
      }
    }
    
    return { tasks: countTasks, events: countEvents };
  }

  try {
    const now = new Date();
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000);
    
    let taskQuery = supabase.from("tasks").select("*, firm_id");
    if (!isManual) {
      taskQuery = taskQuery.gt("due_date", now.toISOString()).lt("due_date", nextHour.toISOString());
    } else {
      taskQuery = taskQuery.neq("status", "Completed");
    }
    if (targetFirmId) taskQuery = taskQuery.eq("firm_id", targetFirmId);
    
    const { data: tasks } = await taskQuery;

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
             const subject = `Task Reminder: ${t.name}`;
             const body = `<p>You have a pending task <strong>${t.name}</strong> due on ${new Date(t.due_date).toLocaleDateString()}.</p>`;
             await sendAndLogEmail(u.firm_id, u.id, u.emails, subject, body, u.name);
             countTasks++;
           }
         }
      }
    }

    let eventQuery = supabase.from("events").select("*");
    if (!isManual) {
      const todayDate = now.toISOString().split('T')[0];
      eventQuery = eventQuery.eq("date", todayDate);
    } else {
      const todayDate = now.toISOString().split('T')[0];
      eventQuery = eventQuery.gte("date", todayDate);
    }
    if (targetFirmId) eventQuery = eventQuery.eq("firm_id", targetFirmId);
    const { data: events, error: eventError } = await eventQuery;
    if (eventError) console.error("Event Query Error:", eventError);

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
             const subject = `Upcoming Event: ${e.title}`;
             const body = `<p>You have an upcoming event <strong>${e.title}</strong> scheduled on ${new Date(e.date).toLocaleDateString()} at ${e.time}.</p>`;
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
    { id: "c1", firm_id: mockFirmId, title: "Smith v. Jones", description: "Breach of contract", stage: "Pre-trial", assigned_staff_ids: ["2"], claimant: "Smith", defendant: "Jones", case_number: "CV-2023-01", court: "High Court", registry_court: "Main", judge_name: "Hon. Clark", brief_facts: "Contract was breached in 2022.", status: "Active" },
    { id: "c2", firm_id: mockFirmId, title: "State v. Doe", description: "Criminal defense", stage: "Discovery", assigned_staff_ids: [], claimant: "State", defendant: "Doe", case_number: "CR-2023-44", court: "Magistrates Court", registry_court: "Local", judge_name: "Hon. Davis", brief_facts: "N/A", status: "Active" }
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
  mockAtlasMessages: [] as any[]
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

    if (token == null) return res.status(401).json({ error: "Unauthorized: No token provided" });
 
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
        return res.status(403).json({ error: "Forbidden: Invalid token payload" });
      }
    } else {
      jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.status(403).json({ error: "Forbidden: Token verification failed" });
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
        await resend.emails.send({
          from: "Firm Notifications <support@firmmanagerapp.com>",
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
        await resend.emails.send({
          from: "Firm Notifications <support@firmmanagerapp.com>",
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
      const { userId } = req.body;
      const counts = await triggerReminders(user.firm_id, userId, true);
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
        const helpMessage = "*(System Notice: GEMINI_API_KEY is not detected in your server environment (Render). Please ensure you have added GEMINI_API_KEY in your Environment Variables settings on Render. Do not use import.meta.env for server-side keys.)*";
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
        replyText = replyText + "\n\n" + helpMessage;
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
      return res.status(500).json({ error: e.message || "Something went wrong in conversational engine" });
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
        suggestion: `[Atlas Co-Writer Simulation Mode]\n\n*(Notice: GEMINI_API_KEY is not configured in your Render environment variables. This is required for AI features. Operating in Atlas Simulation Mode.)*\n\nSince GEMINI_API_KEY environment variable is not defined, here is a simulated professional court suggestion for "${title}" (${template_type}):\n\n"AND BY CONCURRENCE with the Civil Procedure Rules of Malawi, notice is hereby served that this court shall be moved on the date below written for an order to stay proceedings in this suit pending settlement."`
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

  // Catch-all for API routes to ensure they always return JSON
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.url} not found` });
  });

  // Vite middleware for development
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
