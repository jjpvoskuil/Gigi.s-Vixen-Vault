# Session log

Newest first. One dated entry per working session.

## 2026-11-05 — Moved from Streamlit to the web app
- Built the React app in `web/` (design E2 "Velvet Vault"): Closet, Unlock, Add, Me, More → Punch list.
- Supabase: schema + row-level security (`web/supabase/schema.sql`), Google sign-in (John admin, Gigi member),
  private `vault` bucket. Edge Functions `vault-ai` and `vault-punch` deployed by John; secrets ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL, GITHUB_TOKEN (the same GitHub key the old app used).
- Netlify site `vixen-vault` auto-deploys `main`; tests gate every deploy (60 tests).
- Fixes from John: item sheet opens in place on Unlock; sheets were hidden under the tab bar on iPhone (portal fix);
  delete from the sheet header and Select-several delete in the Closet.
- Retired: John deleted the Streamlit Cloud app and the `vixen-vault-home` launcher; both phones use the new home-screen
  icon. Streamlit code removed from the repo (Python rules kept in `web/reference/` for parity fixtures).
- Next: try-on (see Gigi's outfits on her body photos) — needs an image model; Claude can't generate images.
