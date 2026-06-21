// Copy this file to config.js for a no-build local setup.
// The anon key is public by design; security must come from Supabase RLS.
// Never put a service_role key in this file.
window.__PMO_CONFIG__ = {
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseAnonKey: 'your-public-anon-key',
};
