-- Law Firm Staff Dashboard Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table for firms (Matches the existing firm schema)
CREATE TABLE IF NOT EXISTS public.firms (
  id uuid not null default uuid_generate_v4(),
  name character varying(255) not null,
  logo_url text null,
  color_theme jsonb null default '{"primary": "#121212", "secondary": "#10B981"}'::jsonb,
  phone_number character varying(50) null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint firms_pkey primary key (id)
) TABLESPACE pg_default;

-- Table for staff
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL CHECK (role IN ('Managing Partner', 'Associate', 'Advocate', 'Intern', 'Clerk', 'Secretary')),
    accessible_menus TEXT[] DEFAULT '{}',
    case_access_mode TEXT DEFAULT 'assigned' CHECK (case_access_mode IN ('assigned', 'all')),
    allowed_cases UUID[] DEFAULT '{}',
    allowed_folders UUID[] DEFAULT '{}',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for cases
CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    stage TEXT DEFAULT 'Pre-trial', -- Removed check constraint to allow custom stages
    assigned_staff_ids UUID[] DEFAULT '{}',
    
    -- New Fields
    claimant TEXT,
    defendant TEXT,
    case_number TEXT,
    court TEXT,
    specific_court_other TEXT,
    registry_court TEXT,
    judge_name TEXT,
    brief_facts TEXT,
    status TEXT DEFAULT 'Active' CHECK (status IN ('Active', 'Pending', 'Closed')),
    labels TEXT[] DEFAULT '{}',
    likelihood_of_loss_gain NUMERIC DEFAULT 0,
    potential_loss NUMERIC DEFAULT 0,
    estimated_legal_fees NUMERIC DEFAULT 0,
    department TEXT DEFAULT 'General',
    case_type TEXT DEFAULT 'Civil',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for case notes
CREATE TABLE IF NOT EXISTS case_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    author_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for tasks
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    priority TEXT DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),
    assigned_to UUID[] DEFAULT '{}',
    created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for events (Diary)
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    time TIME NOT NULL,
    created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    type TEXT DEFAULT 'Court Date',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for Folders
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    permitted_staff UUID[] DEFAULT '{}',
    created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for files (Document Vault)
CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_url TEXT NOT NULL,
    uploaded_by UUID REFERENCES staff(id) ON DELETE SET NULL,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for file billing/time tracker
CREATE TABLE IF NOT EXISTS file_time_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    hours NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for filing logs
CREATE TABLE IF NOT EXISTS filing_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    staff_name TEXT,
    date DATE NOT NULL,
    document TEXT NOT NULL,
    rate_mwk NUMERIC NOT NULL,
    case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
    case_title TEXT,
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- Note: When initializing the first time, you might want to run:
-- INSERT INTO firms (name) VALUES ('Default Law Firm');
-- INSERT INTO staff (firm_id, name, username, role, status) VALUES ((SELECT id FROM firms LIMIT 1), 'Managing Partner', 'admin', 'Managing Partner', 'active');
-- And then update the password parameter for the admin after creating it via setup, or have a default seeded password hash.

-- Table for clients
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for appointments
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table for email_logs
CREATE TABLE IF NOT EXISTS public.email_logs (
  id uuid not null default extensions.uuid_generate_v4 (),
  firm_id uuid not null,
  recipient_id uuid null,
  recipient_email text not null,
  subject text not null,
  body text null,
  sent_at timestamp with time zone null default now(),
  status text null default 'sent'::text,
  constraint email_logs_pkey primary key (id)
);

-- Enable Row Level Security and add globally permissive policies so no database clients are blocked
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select" ON public.email_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.email_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.email_logs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.email_logs FOR DELETE USING (true);

-- -----------------------------------------------------------------
-- SECURE SERVERLESS EMAIL DISPATCH ENGINE FOR STATIC DEPLOYMENTS
-- -----------------------------------------------------------------

-- 1. Add secret configuration fields to the private firms table
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS resend_api_key TEXT;
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS resend_from_email TEXT;

-- 2. Enable the required HTTP calling extension in Supabase
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- 3. Create the automated database trigger function to dispatch emails via Resend's REST API
CREATE OR REPLACE FUNCTION public.send_email_via_resend()
RETURNS trigger AS $$
DECLARE
  resend_key text;
  from_email text;
  payload json;
  response_status integer;
  response_body text;
BEGIN
  -- Grab credentials stored in the sender firm's secure config
  SELECT resend_api_key, resend_from_email INTO resend_key, from_email 
  FROM public.firms 
  WHERE id = NEW.firm_id;

  -- Ensure credentials are set; if not, flag as configuration error
  IF resend_key IS NULL OR resend_key = '' THEN
    NEW.status := 'failed_missing_api_key';
    RETURN NEW;
  END IF;

  -- Default to Resend onboarding domain if custom email is not yet configured
  IF from_email IS NULL OR from_email = '' THEN
    from_email := 'onboarding@resend.dev';
  END IF;

  -- Format the standard Resend JSON request body
  payload := json_build_object(
    'from', from_email,
    'to', json_build_array(NEW.recipient_email),
    'subject', NEW.subject,
    'html', NEW.body
  );

  -- Perform the secure, out-of-band HTTP request directly from Supabase
  BEGIN
    SELECT status, content INTO response_status, response_body 
    FROM extensions.http((
      'POST',
      'https://api.resend.com/emails',
      ARRAY[
        extensions.http_header('Authorization', 'Bearer ' || resend_key),
        extensions.http_header('Content-Type', 'application/json')
      ],
      'application/json',
      payload::text
    )::extensions.http_request);

    IF response_status >= 200 AND response_status < 300 THEN
      NEW.status := 'sent';
      NEW.sent_at := now();
    ELSE
      NEW.status := 'failed_api_error';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NEW.status := 'failed_exception';
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Establish the trigger to intercept 'pending' logs on insert or update and dispatch them
DROP TRIGGER IF EXISTS trigger_send_email_on_log ON public.email_logs;
CREATE TRIGGER trigger_send_email_on_log
  BEFORE INSERT OR UPDATE ON public.email_logs
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.send_email_via_resend();


-- -----------------------------------------------------------------
-- CHRONOLOGICAL CASE TIMELINE & METADATA UPGRADES
-- -----------------------------------------------------------------

-- Table for Case Milestones (Timeline)
CREATE TABLE IF NOT EXISTS public.case_milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed', 'Not Applicable')),
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on case_milestones and add permissive policies
ALTER TABLE public.case_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select on milestones" ON public.case_milestones FOR SELECT USING (true);
CREATE POLICY "Allow public insert on milestones" ON public.case_milestones FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on milestones" ON public.case_milestones FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on milestones" ON public.case_milestones FOR DELETE USING (true);

-- Alter Files Table to support Metadata
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'Other';
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS version_number TEXT DEFAULT '1.0';
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS tags TEXT; -- Comma-separated tags
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'Working Draft' CHECK (classification IN ('Confidential', 'Court Copy', 'Working Draft', 'Final Copy'));

-- Table for File Version History
CREATE TABLE IF NOT EXISTS public.file_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    version_number TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_url TEXT NOT NULL,
    author TEXT,
    notes TEXT,
    doc_type TEXT DEFAULT 'Other',
    tags TEXT,
    classification TEXT DEFAULT 'Working Draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on file_versions and add permissive policies
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select on file_versions" ON public.file_versions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on file_versions" ON public.file_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on file_versions" ON public.file_versions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on file_versions" ON public.file_versions FOR DELETE USING (true);

-- Upgrade for Case Notes: Pinned state, Rich notes (already has content, let's add pinning)
ALTER TABLE public.case_notes ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false;
ALTER TABLE public.case_notes ADD COLUMN IF NOT EXISTS author_name TEXT;

-- Upgrade for Conflict Check: Companies, Directors on cases
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS companies TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS directors TEXT;

-- Table for Time Recording Module
CREATE TABLE IF NOT EXISTS public.time_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
    case_title TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    nature_of_work TEXT NOT NULL, -- 'drafting', 'legal research', 'court attendance', 'consultations', 'travelling', 'telephone calls'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and add permissive policies for time_records
ALTER TABLE public.time_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select on time_records" ON public.time_records FOR SELECT USING (true);
CREATE POLICY "Allow public insert on time_records" ON public.time_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on time_records" ON public.time_records FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on time_records" ON public.time_records FOR DELETE USING (true);

-- Table for Audit Trail Logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    staff_name TEXT,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and add permissive policies (only select/insert, no update or delete for immutability)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select on audit_logs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- Table for backups
CREATE TABLE IF NOT EXISTS public.backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and add permissive policies
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public select on backups" ON public.backups FOR SELECT USING (true);
CREATE POLICY "Allow public insert on backups" ON public.backups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on backups" ON public.backups FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on backups" ON public.backups FOR DELETE USING (true);




