-- =====================================================================
-- SUPABASE / POSTGRESQL DATABASE SCHEMA UPDATES (MIGRATION SCRIPT)
-- FirmManager Practice Management Platform
-- =====================================================================
-- This file lists all the incremental SQL updates added to the system 
-- for easy tracking and execution in your Supabase SQL Editor.
-- Run these queries on top of your existing tables to apply the latest upgrades.

-- ---------------------------------------------------------------------
-- 1. CLIENT ACCESS PORTAL SCHEMA UPGRADES
-- ---------------------------------------------------------------------

-- Create registered clients table
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

-- Create client appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ---------------------------------------------------------------------
-- 2. SECURE SERVERLESS EMAIL DISPATCH ENGINE
-- ---------------------------------------------------------------------

-- Alter firms table to store Resend API credentials securely
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS resend_api_key TEXT;
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS resend_from_email TEXT;

-- Create email dispatch history logs table
CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    recipient_id UUID NULL,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NULL,
    sent_at TIMESTAMP WITH TIME ZONE NULL DEFAULT NOW(),
    status TEXT NULL DEFAULT 'sent',
    CONSTRAINT email_logs_pkey PRIMARY KEY (id)
);

-- Enable Row Level Security and add permissive policies
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select" ON public.email_logs;
DROP POLICY IF EXISTS "Allow public insert" ON public.email_logs;
DROP POLICY IF EXISTS "Allow public update" ON public.email_logs;
DROP POLICY IF EXISTS "Allow public delete" ON public.email_logs;

CREATE POLICY "Allow public select" ON public.email_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.email_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.email_logs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.email_logs FOR DELETE USING (true);

-- Enable the required HTTP calling extension in Supabase
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Create out-of-band DB trigger function for sending emails directly via Resend
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

-- Establish the trigger to intercept 'pending' email logs and dispatch them on save
DROP TRIGGER IF EXISTS trigger_send_email_on_log ON public.email_logs;
CREATE TRIGGER trigger_send_email_on_log
  BEFORE INSERT OR UPDATE ON public.email_logs
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.send_email_via_resend();


-- ---------------------------------------------------------------------
-- 3. CHRONOLOGICAL MATTERS TIMELINE (MILESTONES)
-- ---------------------------------------------------------------------

-- Create case milestones / chronology table
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

-- Enable Row Level Security and add permissive policies
ALTER TABLE public.case_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select on milestones" ON public.case_milestones;
DROP POLICY IF EXISTS "Allow public insert on milestones" ON public.case_milestones;
DROP POLICY IF EXISTS "Allow public update on milestones" ON public.case_milestones;
DROP POLICY IF EXISTS "Allow public delete on milestones" ON public.case_milestones;

CREATE POLICY "Allow public select on milestones" ON public.case_milestones FOR SELECT USING (true);
CREATE POLICY "Allow public insert on milestones" ON public.case_milestones FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on milestones" ON public.case_milestones FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on milestones" ON public.case_milestones FOR DELETE USING (true);


-- ---------------------------------------------------------------------
-- 4. DOCUMENT VAULT METADATA & VERSION CONTROL UPGRADES
-- ---------------------------------------------------------------------

-- Alter files table to support robust classifications and tags
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'Other';
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS version_number TEXT DEFAULT '1.0';
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS tags TEXT; -- Comma-separated list of keywords
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS classification TEXT DEFAULT 'Working Draft' CHECK (classification IN ('Confidential', 'Court Copy', 'Working Draft', 'Final Copy'));

-- Create file version history logging table
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

-- Enable Row Level Security and add permissive policies
ALTER TABLE public.file_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select on file_versions" ON public.file_versions;
DROP POLICY IF EXISTS "Allow public insert on file_versions" ON public.file_versions;
DROP POLICY IF EXISTS "Allow public update on file_versions" ON public.file_versions;
DROP POLICY IF EXISTS "Allow public delete on file_versions" ON public.file_versions;

CREATE POLICY "Allow public select on file_versions" ON public.file_versions FOR SELECT USING (true);
CREATE POLICY "Allow public insert on file_versions" ON public.file_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on file_versions" ON public.file_versions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on file_versions" ON public.file_versions FOR DELETE USING (true);


-- ---------------------------------------------------------------------
-- 5. MATTERS AND NOTES UPGRADES (PINNED NOTES & CONFLICT CHECKS)
-- ---------------------------------------------------------------------

-- Alter case notes table to support pinning states and custom author names
ALTER TABLE public.case_notes ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT false;
ALTER TABLE public.case_notes ADD COLUMN IF NOT EXISTS author_name TEXT;

-- Alter cases table to record company and director connections for conflict checks
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS companies TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS directors TEXT;


-- ---------------------------------------------------------------------
-- 6. TIMELOGS & TIME RECORDING MODULE
-- ---------------------------------------------------------------------

-- Create time_records table for active tracking
CREATE TABLE IF NOT EXISTS public.time_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
    case_title TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    nature_of_work TEXT NOT NULL, -- E.g., 'drafting', 'legal research', 'court attendance', 'consultations', 'travelling', 'telephone calls'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security and add permissive policies
ALTER TABLE public.time_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select on time_records" ON public.time_records;
DROP POLICY IF EXISTS "Allow public insert on time_records" ON public.time_records;
DROP POLICY IF EXISTS "Allow public update on time_records" ON public.time_records;
DROP POLICY IF EXISTS "Allow public delete on time_records" ON public.time_records;

CREATE POLICY "Allow public select on time_records" ON public.time_records FOR SELECT USING (true);
CREATE POLICY "Allow public insert on time_records" ON public.time_records FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on time_records" ON public.time_records FOR UPDATE USING (true);
CREATE POLICY "Allow public delete ON time_records" ON public.time_records FOR DELETE USING (true);


-- ---------------------------------------------------------------------
-- 7. AUDIT TRAIL LOGGING (IMMUTABLE LOGS)
-- ---------------------------------------------------------------------

-- Create system activity audit logs table
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

-- Enable Row Level Security and add policies (only select/insert for immutability)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow public insert on audit_logs" ON public.audit_logs;

CREATE POLICY "Allow public select on audit_logs" ON public.audit_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on audit_logs" ON public.audit_logs FOR INSERT WITH CHECK (true);


-- ---------------------------------------------------------------------
-- 8. MATTERS COLOR-CODED LABELS SCHEMA UPGRADE
-- ---------------------------------------------------------------------

-- Alter cases table to support color-coded labels for classification and filtering
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS labels TEXT[] DEFAULT '{}';


-- ---------------------------------------------------------------------
-- 9. OUTSTANDING LEGAL CLAIMS REPORTING FIELDS
-- ---------------------------------------------------------------------

-- Alter cases table to support financial metrics, department, and case type
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS likelihood_of_loss_gain NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS potential_loss NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS estimated_legal_fees NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS department TEXT DEFAULT 'General';
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS case_type TEXT DEFAULT 'Civil';


-- ---------------------------------------------------------------------
-- 10. AUTOMATIC BACKUPS TABLE
-- ---------------------------------------------------------------------

-- Create backups table for system state snapshot preservation and recovery
CREATE TABLE IF NOT EXISTS public.backups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and add public permissive policies
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select on backups" ON public.backups;
DROP POLICY IF EXISTS "Allow public insert on backups" ON public.backups;
DROP POLICY IF EXISTS "Allow public update on backups" ON public.backups;
DROP POLICY IF EXISTS "Allow public delete on backups" ON public.backups;

CREATE POLICY "Allow public select on backups" ON public.backups FOR SELECT USING (true);
CREATE POLICY "Allow public insert on backups" ON public.backups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on backups" ON public.backups FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on backups" ON public.backups FOR DELETE USING (true);


-- -------------------------------------------------------------------
-- 11. ADDITIONAL CASE INFORMATION FIELDS
-- -------------------------------------------------------------------

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS nature_of_claim TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS relief_sought TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS amount_claimed NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS counterclaim TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS cause_of_action TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS division TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS registry TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS opposing_counsel TEXT;

-- Risk Assessment
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS likelihood_of_success TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS likelihood_of_loss TEXT;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'Medium';
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS risk_notes TEXT;

-- Financial Exposure
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS potential_gain NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS court_filing_fees NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS disbursements NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS expert_witness_costs NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS transport_costs NUMERIC DEFAULT 0;
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS other_litigation_costs NUMERIC DEFAULT 0;

