-- SQL Script to set up Atlas AI Chat threads and messages
-- Execute this script in your Supabase SQL editor to enable persistent AI assistance.

-- 1. Create the Atlas Chat Threads table
CREATE TABLE IF NOT EXISTS public.atlas_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES public.firms(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.staff(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create the Atlas Chat Messages table
CREATE TABLE IF NOT EXISTS public.atlas_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES public.atlas_threads(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'model')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable Supabase Realtime for these tables
alter publication supabase_realtime add table public.atlas_threads;
alter publication supabase_realtime add table public.atlas_messages;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.atlas_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atlas_messages ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for atlas_threads
-- Ensure each staff member can ONLY view and manage threads they created, locked to their proper firm_id
CREATE POLICY "Users can view their own threads" ON public.atlas_threads
    FOR SELECT USING (
        user_id = auth.uid() AND firm_id = (SELECT firm_id FROM public.staff WHERE id = auth.uid())
    );

CREATE POLICY "Users can create their own threads" ON public.atlas_threads
    FOR INSERT WITH CHECK (
        user_id = auth.uid() AND firm_id = (SELECT firm_id FROM public.staff WHERE id = auth.uid())
    );

CREATE POLICY "Users can update their own threads" ON public.atlas_threads
    FOR UPDATE USING (
        user_id = auth.uid() AND firm_id = (SELECT firm_id FROM public.staff WHERE id = auth.uid())
    );

CREATE POLICY "Users can delete their own threads" ON public.atlas_threads
    FOR DELETE USING (
        user_id = auth.uid() AND firm_id = (SELECT firm_id FROM public.staff WHERE id = auth.uid())
    );

-- 6. RLS Policies for atlas_messages
-- Messages are isolated by ensuring the parent thread belongs to the current staff member
CREATE POLICY "Users can view messages of their own threads" ON public.atlas_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.atlas_threads 
            WHERE id = atlas_messages.thread_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages into their own threads" ON public.atlas_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.atlas_threads 
            WHERE id = thread_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages of their own threads" ON public.atlas_messages
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.atlas_threads 
            WHERE id = atlas_messages.thread_id AND user_id = auth.uid()
        )
    );
