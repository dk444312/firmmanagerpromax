import { createClient } from "@supabase/supabase-js";

// Uses VITE_ values or defined values from vite.config.ts
const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || (import.meta as any).env.SUPABASE_URL || "https://uiymwwlamagbylxqgwvj.supabase.co";
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || (import.meta as any).env.SUPABASE_ANON_KEY || "sb_publishable_3F1iWKvxKjTzFkYIyzrgpg_GuFLiOIX";

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
