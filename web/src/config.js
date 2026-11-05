// Supabase project address + its PUBLISHABLE key. Both are meant to be public: on their own they unlock
// nothing — the row-level security rules in supabase/schema.sql decide who sees what.
// Never put a "secret" / "service_role" key here (or anywhere in web/).
export const SUPABASE_URL = "PASTE_PROJECT_URL";
export const SUPABASE_KEY = "PASTE_PUBLISHABLE_KEY";
export const BUCKET = "vault";
