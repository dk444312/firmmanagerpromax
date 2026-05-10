-- Messages Feature Schema

-- 1. Channels (table for direct messages and group chats)
CREATE TABLE IF NOT EXISTS public.channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES public.firms(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'group')),
    name VARCHAR(255),
    created_by UUID REFERENCES public.staff(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Channel Members Config
CREATE TABLE IF NOT EXISTS public.channel_members (
    channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_read_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (channel_id, user_id)
);

-- 3. Messages
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id UUID REFERENCES public.firms(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    content TEXT,
    file_url TEXT,
    file_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Realtime needs to be enabled for these tables
alter publication supabase_realtime add table public.channels;
alter publication supabase_realtime add table public.channel_members;
alter publication supabase_realtime add table public.messages;

-- RLS
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Channels RLS: User can view channels they are a member of
CREATE POLICY "Users can view their channels" ON public.channels
    FOR SELECT USING (
        firm_id = (SELECT firm_id FROM public.staff WHERE id = auth.uid())
    );

CREATE POLICY "Users can create channels for their firm" ON public.channels
    FOR INSERT WITH CHECK (
        firm_id = (SELECT firm_id FROM public.staff WHERE id = auth.uid())
    );

-- Channel Members RLS
CREATE POLICY "Users can view members of their channels" ON public.channel_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.staff 
            WHERE id = channel_members.user_id AND firm_id = (SELECT firm_id FROM public.staff WHERE id = auth.uid())
        )
    );

CREATE POLICY "Users can join or be added to channels in their firm" ON public.channel_members
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.channels 
            WHERE id = channel_id AND firm_id = (SELECT firm_id FROM public.staff WHERE id = auth.uid())
        )
    );

CREATE POLICY "Users can update their own last_read_at" ON public.channel_members
    FOR UPDATE USING (user_id = auth.uid());

-- Messages RLS
CREATE POLICY "Users can view messages in their channels" ON public.messages
    FOR SELECT USING (
        channel_id IN (
            SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can send messages to their channels" ON public.messages
    FOR INSERT WITH CHECK (
        channel_id IN (
            SELECT channel_id FROM public.channel_members WHERE user_id = auth.uid()
        )
        AND sender_id = auth.uid()
    );
