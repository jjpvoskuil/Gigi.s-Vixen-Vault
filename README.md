# Gigi's Vixen Vault

A private, phone-first web app for Gigi's closet: photograph clothes, let AI describe them, keep her
measurements, body photos and favorite styles, and get outfit picks built from what she owns.

**Live:** https://vixen-vault.netlify.app (Google sign-in; only emails on the `app_users` list get in).

## Screens
- **Closet** — photo grid by category, search, filters and sorting; tap a piece to edit it, favorite it, log a wear,
  have the AI (re-)describe it, or delete it. *Select* deletes several at once.
- **Unlock** — pick a style (+ occasion / weather); the AI builds outfits from her described pieces, with why it works,
  a styling tip, one piece worth adding, and pieces that would unlock more looks. *I'm wearing this today* logs wears.
- **Add** — take a photo or pick several; each is shrunk on the phone (2000 px + 480 px thumbnail), stored privately,
  and described by the AI. Pieces still waiting for a description can be described in one go.
- **Me** — measurements and sizes, fit and color notes, body photos (Front / Side / Back), and her styles (add her own).
- **More → Punch list** — bugs, changes and ideas, with notes and screenshots. Claude works through it each session.

## How it's built
| Piece | Where |
|---|---|
| Web app (React + Vite) | `web/` → Netlify builds and deploys every push to `main` (`netlify.toml`) |
| Data, photos, sign-in | Supabase: tables + row-level security (`web/supabase/schema.sql`), private `vault` bucket, Google sign-in |
| AI (photo descriptions, outfits) | Supabase Edge Function `vault-ai` — the Anthropic key lives only there |
| Punch list | Edge Function `vault-punch` → `punch_list.json` on the repo's `punch-list` branch (GitHub key lives only there) |
| Backups | Private repo `jjpvoskuil/vixen-vault-data` — GitHub Actions copy tables + new photos Mon & Thu |

Secrets are never in this repo. Supabase → Edge Functions → Secrets holds `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`
and `GITHUB_TOKEN`. The publishable Supabase key in `web/src/config.js` is public by design.

## Developer commands (in `web/`)
```bash
npm ci
npm run dev          # local app; add ?demo to the URL for made-up data with no sign-in
npm test             # rules + Edge Function tests (also run by Netlify before every deploy)
npm run build
node supabase/build_functions.mjs   # rebuild the pasteable functions/*/index.ts after editing a handler
```
`web/reference/*.py` are the original Python rules; `web/supabase/make_fixtures.py` turns them into the fixtures the
JavaScript ports are tested against.
