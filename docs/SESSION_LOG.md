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
- Try-on added and tested live by John: "See it on me" on Unlock looks and on Closet selections (≤8 pieces) →
  vault-ai action `tryon` → Google Gemini image model (`gemini-3.1-flash-image`, ~7¢/picture at 1K, paid tier so
  images aren't used for training). Secrets GEMINI_API_KEY (+ optional GEMINI_IMAGE_MODEL). Results saved to the
  `tryons` table + `vault/tryons/…`, shown in Me → Looks on me; included in backups.
- Ideas for later: tune the try-on prompt from Gigi's feedback; 2K option; suggest new pieces/colors to buy
  (closet gaps → shopping list).
