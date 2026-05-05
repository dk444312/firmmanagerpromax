import { createClient } from "@supabase/supabase-js";

// Uses VITE_ values
const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = SUPABASE_URL ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
