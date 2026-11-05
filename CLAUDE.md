# Notes for Claude (developer)

John (retiree, no coding background) owns this; the app is for his wife Jeanne ("Gigi"). Claude writes all code and
pushes to `main`. John does the setup clicks — explain them one screen at a time and wait for his screenshot.
He prefers direct, accurate answers.

## Start of every session
1. Read `docs/SESSION_LOG.md` (latest entry first).
2. Read the punch list — bugs/changes/ideas Gigi and John logged in the app:
   ```bash
   git fetch origin punch-list
   git show origin/punch-list:punch_list.json
   ```
   Work items with status "Open"/"In progress", High priority first. Read `comments` and `screenshots`
   (`git show origin/punch-list:screenshots/<file>`). A new comment or screenshot on a Done item reopens it.
3. When an item is finished: set `status` "Done", write a short plain-English `dev_notes`, bump `updated`, commit to
   the `punch-list` branch only (never `main`), keep the shape `{"items": [...]}` with 2-space indent. Pull first —
   the app writes to the same file.
4. End of session: add a dated entry to `docs/SESSION_LOG.md` (what changed, what John set up, what's next).

## Stack
- `web/` — React 19 + Vite. Netlify (site `vixen-vault`) runs `npm ci && npm test && npm run build` on every push to
  `main`; a failing test blocks the deploy.
- Supabase project `heqbdsfznchdtknhpgql`: tables `items`, `profile`, `body_photos`, `styles`, `app_users`; private
  bucket `vault` (`items/…`, `body/…`, `_thumb.jpg` beside each photo). Row-level security: approved emails
  (`app_users`) see and edit everything; admins manage `app_users`. Schema changes → give John SQL to paste into
  Supabase → SQL Editor (`web/supabase/schema.sql` is re-runnable).
- Edge Functions are deployed by pasting `web/supabase/functions/<name>/index.ts` (GENERATED — edit `handler.js` /
  `src/lib/*.js`, then `node supabase/build_functions.mjs`; the tests fail if index.ts is stale) into Supabase →
  Edge Functions → <name> → Code, then Deploy. "Verify JWT with legacy secret" is OFF on both; the functions check
  `is_approved()` themselves.
  - `vault-ai` (describe a photo, outfits) — secrets `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (claude-sonnet-5-5).
    Sonnet 5.5 rejects forced tool_choice: requests use strict tools + `tool_choice: auto` + "answer only by calling".
    Also `tryon` → Google Gemini image model; secrets `GEMINI_API_KEY`, optional `GEMINI_IMAGE_MODEL`
    (default gemini-3.1-flash-image). The app saves results to the `tryons` table (Me → Looks on me).
  - `vault-punch` — secret `GITHUB_TOKEN` (fine-grained, Contents read/write on this repo; it expires — the app then
    says GitHub didn't accept the key).
- `web/src/lib/db.js`: one data API, two backends — Supabase, and `demoDb` (browser-only made-up data, `?demo`).
- Rules ported from Python are parity-tested: `web/reference/*.py` → `web/supabase/make_fixtures.py` → `*.fixtures.json`.
- Backups: private repo `vixen-vault-data` (GitHub Actions Mon & Thu; restore via `web/supabase/make_restore.py`).
- Phone-first: test at 390×844 with Playwright (`?demo`). Pop-up sheets render through a portal on `document.body`
  — on iPhone a scrolling container traps children under the fixed tab bar.
- Light mode only. Design "E2 Velvet Vault": bone-grey ground, oxblood accent, black leather cards with chrome studs,
  Italiana display + Outfit body fonts.
