# Notes for Claude (developer)

John (retiree, no coding background) owns this; the app is for his wife Jeanne ("Gigi"). Claude writes all code and
pushes to `main`. John does the setup clicks — explain them one screen at a time and wait for his screenshot.
He prefers direct, accurate answers.

## Start of every session
1. Read `docs/SESSION_LOG.md` (latest entry first).
2. Read the punch list — bugs/changes/ideas Gigi and John logged in the app. It lives in the **private** repo
   `jjpvoskuil/vixen-vault-data`, branch `punch-list` (moved there 2026-11-10: this app repo is public, and
   screenshots can show her photos — never copy punch-list content or screenshots into this repo). Attach that repo
   (add_repo, push access), then:
   ```bash
   git -C <data-repo> fetch origin punch-list
   git -C <data-repo> show origin/punch-list:punch_list.json
   ```
   Work items with status "Open"/"In progress", High priority first. Read `comments` and `screenshots`
   (`git show origin/punch-list:screenshots/<file>`). A new comment or screenshot on a Done item reopens it.
3. When an item is finished: set `status` "Done", write a short plain-English `dev_notes`, bump `updated`, commit to
   that repo's `punch-list` branch only, keep the shape `{"items": [...]}` with 2-space indent. Pull first — the
   app writes to the same file.
4. End of session: add a dated entry to `docs/SESSION_LOG.md` (what changed, what John set up, what's next).

## Stack
- **This repo is PUBLIC** (since 2026-11-10, for free GitHub Pages). Never commit personal data: no photos, real
  measurements, email addresses, keys or punch-list content. All data lives in Supabase; the punch list and backups
  live in the private `vixen-vault-data` repo.
- `web/` — React 19 + Vite, hosted on **GitHub Pages**: https://jjpvoskuil.github.io/Gigi.s-Vixen-Vault/
  `.github/workflows/pages.yml` runs `npm ci`, `npm test`, then `npm run build` with `BASE=/Gigi.s-Vixen-Vault/` on
  every push to main touching `web/**`; a failing test blocks the deploy. Check with `gh run list --workflow pages.yml`.
  Everything local must be base-aware: `%BASE_URL%` in index.html, `import.meta.env.BASE_URL` in code, relative
  manifest paths; sign-in `redirectTo` = origin + BASE_URL. Pages can't send headers, so robots/referrer are meta
  tags and a script in index.html refuses to run inside a frame. The build time shows on More and the sign-in screen.
  `netlify.toml` is unused (the Netlify project was deleted 2026-11-10 after its free deploy credits ran out); kept so a
  Netlify site could be recreated if ever needed.
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
  - `vault-punch` — secret `GITHUB_TOKEN` (Contents read/write on `vixen-vault-data`; it expires — the app then says
    GitHub didn't accept the key). Writes `punch_list.json` + `screenshots/` on that repo's `punch-list` branch
    (`GITHUB_REPO` / `GITHUB_BRANCH` secrets override).
- `web/src/lib/db.js`: one data API, two backends — Supabase, and `demoDb` (browser-only made-up data, `?demo`).
- Rules ported from Python are parity-tested: `web/reference/*.py` → `web/supabase/make_fixtures.py` → `*.fixtures.json`.
- Backups: private repo `vixen-vault-data` (GitHub Actions Mon & Thu; restore via `web/supabase/make_restore.py`).
- Phone-first: test at 390×844 with Playwright (`?demo`). Pop-up sheets render through a portal on `document.body`
  — on iPhone a scrolling container traps children under the fixed tab bar.
- Light mode only. Design "E2 Velvet Vault": bone-grey ground, oxblood accent, black leather cards with chrome studs,
  Italiana display + Outfit body fonts.
