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
