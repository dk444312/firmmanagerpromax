-- Add case linkage to existing tables
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
ALTER TABLE firms ADD COLUMN IF NOT EXISTS ui_config jsonb DEFAULT '{}'::jsonb;

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
