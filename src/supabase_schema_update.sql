-- Add case linkage to existing tables
ALTER TABLE cases ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS case_id uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS case_title text;

ALTER TABLE events ADD COLUMN IF NOT EXISTS case_id uuid;
ALTER TABLE events ADD COLUMN IF NOT EXISTS case_title text;

CREATE TABLE IF NOT EXISTS case_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    author_id UUID REFERENCES staff(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE files ADD COLUMN IF NOT EXISTS case_id uuid;
-- Create storage buckets if they don't exist
INSERT INTO storage.buckets (id, name, public) VALUES ('profiles', 'profiles', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('firm-files', 'firm-files', true) ON CONFLICT (id) DO NOTHING;

-- Make sure to allow public access to profiles
CREATE POLICY "Public profiles access" ON storage.objects FOR SELECT USING ( bucket_id = 'profiles' );
CREATE POLICY "Public profiles upload" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'profiles' );

ALTER TABLE files ADD COLUMN IF NOT EXISTS case_title text;
ALTER TABLE files ADD COLUMN IF NOT EXISTS pending_filing boolean DEFAULT false;

ALTER TABLE files ADD COLUMN IF NOT EXISTS requires_approval boolean DEFAULT false;
ALTER TABLE files ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'pending'; -- pending, approved, rejected
ALTER TABLE files ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE files ADD COLUMN IF NOT EXISTS filing_fee numeric DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS filed boolean DEFAULT false;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS message_notifications boolean DEFAULT true;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS allowed_cases uuid[] DEFAULT '{}';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS allowed_folders uuid[] DEFAULT '{}';
ALTER TABLE staff ADD COLUMN IF NOT EXISTS emails text;
ALTER TABLE firms ADD COLUMN IF NOT EXISTS ui_config jsonb DEFAULT '{}'::jsonb;

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

CREATE TABLE IF NOT EXISTS filing_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL,
    staff_id UUID,
    staff_name TEXT,
    date DATE NOT NULL,
    document TEXT NOT NULL,
    rate_mwk NUMERIC NOT NULL,
    case_id UUID,
    case_title TEXT,
    file_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create clients table
CREATE TABLE IF NOT EXISTS clients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id uuid NOT NULL,
  full_name text NOT NULL,
  phone_number text,
  email text,
  gender text,
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'active'
);

-- Create storage buckets for files and profiles (must be executed as superuser or using the Supabase dashboard)
INSERT INTO storage.buckets (id, name, public) VALUES ('files', 'files', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('profiles', 'profiles', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for the files bucket
CREATE POLICY "Public files access" ON storage.objects FOR SELECT USING ( bucket_id = 'files' );
CREATE POLICY "Public files insert" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'files' );
CREATE POLICY "Public files update" ON storage.objects FOR UPDATE USING ( bucket_id = 'files' );
CREATE POLICY "Public files delete" ON storage.objects FOR DELETE USING ( bucket_id = 'files' );

-- Storage policies for the profiles bucket
CREATE POLICY "Public profiles access" ON storage.objects FOR SELECT USING ( bucket_id = 'profiles' );
CREATE POLICY "Public profiles insert" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'profiles' );
CREATE POLICY "Public profiles update" ON storage.objects FOR UPDATE USING ( bucket_id = 'profiles' );
CREATE POLICY "Public profiles delete" ON storage.objects FOR DELETE USING ( bucket_id = 'profiles' );

-- Create Case Drafting Documents table for Atlas Co-writer integration
CREATE TABLE IF NOT EXISTS public.drafting_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    template_type TEXT,
    content TEXT NOT NULL,
    court_name TEXT,
    parties_header TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create Atlas AI Chat tables
CREATE TABLE IF NOT EXISTS public.atlas_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.atlas_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES atlas_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.atlas_threads DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_messages DISABLE ROW LEVEL SECURITY;

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

