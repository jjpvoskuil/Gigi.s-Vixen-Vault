// Supabase project address + its PUBLISHABLE key. Both are meant to be public: on their own they unlock
// nothing — the row-level security rules in supabase/schema.sql decide who sees what.
// Never put a "secret" / "service_role" key here (or anywhere in web/).
export const SUPABASE_URL = "https://heqbdsfznchdtknhpgql.supabase.co";
export const SUPABASE_KEY = "sb_publishable_x-995NW4QDpkkfgYAyFAZw_uw9vq63K";
export const BUCKET = "vault";
