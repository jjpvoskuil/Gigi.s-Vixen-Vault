# Session log

Newest first. One dated entry per working session.

## 2026-11-10 — Moved hosting from Netlify to GitHub Pages
- Why: Netlify's free plan is 300 credits/month at 15 per production deploy (~20 deploys); on Deercast they ran out
  and later deploys were silently "Skipped".
- John chose to make this repo public for free GitHub Pages. Before that: checked the whole history — no photos,
  measurements, keys or data (only icons, code, and sample test numbers). Moved the punch list (and its screenshots)
  to the private repo `vixen-vault-data`, branch `punch-list`; `vault-punch` now defaults there. Removed Gigi's email
  username from the code (the punch list's "From" now comes from the Google first name).
- Pages build: `.github/workflows/pages.yml`, Vite `base` from `BASE`, `%BASE_URL%` in index.html, relative manifest,
  sign-in `redirectTo` = origin + BASE_URL, robots/referrer meta tags + frame guard script, build stamp on More and the
  sign-in screen. Tested under /Gigi.s-Vixen-Vault/ on a simulated iPhone (demo mode): all screens, icons, manifest.
- `netlify.toml` kept as a fallback.
- Settings done in John's Chrome with his OK: "Vault punch list" GitHub key now also reaches `vixen-vault-data`;
  Supabase secret `GITHUB_REPO=jjpvoskuil/vixen-vault-data`; old `punch-list` branch deleted here (copy verified
  identical first); repo made public; Pages source = GitHub Actions (first run failed as expected; manual re-run
  succeeded); Supabase Site URL = https://jjpvoskuil.github.io/Gigi.s-Vixen-Vault/ and redirect URLs
  `https://jjpvoskuil.github.io/Gigi.s-Vixen-Vault/**` added.
- Confirmed live: John signed in at the new address and added a punch-list "Test" item, which landed in
  `vixen-vault-data` (public repo still only has `main`); the test item was then removed.
- Netlify retired (John: "delete it"): its credits were already spent — today's pushes showed "Skipped", the last real
  deploy was Nov 5. Deleted the Netlify project `vixen-vault` (vixen-vault.netlify.app no longer works) and removed both
  Netlify redirect URLs from Supabase (one had been misspelled "ttps://" since setup). Supabase now allows only the
  GitHub Pages address. `netlify.toml` stays in the repo but no Netlify project uses it.

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
- Shop the gaps (More → Shop the gaps): vault-ai action `shop` suggests pieces + colors to buy that pair with what she
  owns (focus style, season, budget), each with "goes with" pieces, ≈ new looks, priority and a size-aware Google
  Shopping link. Wish list in the new `wishlist` table (My list → Bought it → Add photo). Unlock's "even better with"
  and closet-gap ideas add to the same list with one tap. Needs schema.sql re-run + vault-ai re-paste.
- Ideas for later: tune the try-on prompt from Gigi's feedback; 2K try-on option.
