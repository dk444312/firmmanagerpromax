const { createClient } = require('@supabase/supabase-js');
const sb = createClient("https://uiymwwlamagbylxqgwvj.supabase.co", "sb_publishable_3F1iWKvxKjTzFkYIyzrgpg_GuFLiOIX");
async function run() {
  const { data, error } = await sb.rpc('execute_sql', { query: 'SELECT 1' });
  console.log("data:", data, "error:", error);
}
run();
