import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Client (Service Role for admin operations from Server)
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_dev";

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) 
  : null;

// Use a local JSON file to persist the simulated mock database across dev server restarts
const DB_FILE = path.join(process.cwd(), 'local-db.json');
let mockFirmId = "00000000-0000-0000-0000-000000000000";

let db = {
  mockFirms: [
    { id: mockFirmId, ui_config: {} }
  ] as any[],
  mockStaff: [
    { id: "1", firm_id: mockFirmId, name: "Admin Partner", username: "admin", password_hash: bcrypt.hashSync("admin", 10), role: "Managing Partner", accessible_menus: [], case_access_mode: "all", allowed_cases: [], allowed_folders: [], status: "active", picture: "" },
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
  mockClients: [] as any[]
};

// Load existing DB or initialize if missing
if (!supabase) {
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    } catch (e) {
      console.error("Failed to parse local DB file", e);
    }
  } else {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
}

const saveDb = () => {
  if (!supabase) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Middleware for auth
  const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      (req as any).user = user;
      next();
    });
  };

  // --- API Routes ---

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    let staffMember;

    if (supabase) {
      const { data, error } = await supabase.from('staff').select('*').eq('username', username).single();
      if (error || !data) return res.status(401).json({ error: "Invalid credentials" });
      staffMember = data;
    } else {
      staffMember = db.mockStaff.find(s => s.username === username);
      if (!staffMember) return res.status(401).json({ error: "Invalid credentials" });
    }

    if (staffMember.status !== 'active') {
      return res.status(403).json({ error: "Account not active. Please complete setup." });
    }

    const validPassword = await bcrypt.compare(password, staffMember.password_hash);
    if (!validPassword) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: staffMember.id, firm_id: staffMember.firm_id, role: staffMember.role }, JWT_SECRET, { expiresIn: '8h' });
    
    // Omit password hash in response
    const { password_hash, ...userProfile } = staffMember;
    res.json({ token, user: userProfile });
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
    if (supabase) {
      const { data, error } = await supabase.from('clients').select('*').eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } else {
      res.json(db.mockClients.filter(c => c.firm_id === user.firm_id));
    }
  });

  app.post("/api/clients", authenticateToken, async (req, res) => {
    const user = (req as any).user;
    const { password, ...clientData } = req.body;
    const password_hash = bcrypt.hashSync(password || 'defaultpass', 10);
    
    if (supabase) {
      const dbClient = { ...clientData, password_hash, firm_id: user.firm_id };
      const { data, error } = await supabase.from('clients').insert([dbClient]).select().single();
      if (error) {
        console.error("Supabase Clients Insert Error:", error);
        return res.status(500).json({ error: error.message });
      }
      res.json(data);
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
    
    if (supabase) {
      const { data, error } = await supabase.from('clients').update(updateData).eq('id', req.params.id).eq('firm_id', user.firm_id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
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
    if (supabase) {
      const { error } = await supabase.from('clients').delete().eq('id', req.params.id).eq('firm_id', user.firm_id);
      if (error) return res.status(500).json({ error: error.message });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
