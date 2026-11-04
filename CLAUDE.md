# Notes for Claude (developer)

## Punch list = the to-do list for each session
Gigi and John log bugs/changes/ideas in the app's **Punch List** page. It is stored as
`punch_list.json` on the **`punch-list` branch** (never on `main`, so saving an item doesn't redeploy the app).
Screenshots are in `screenshots/` on that same branch.

At the start of each session:
```bash
git fetch origin punch-list
git show origin/punch-list:punch_list.json
```
Work items with status "Open"/"In progress", High priority first. Items may carry `screenshots` (list; older
items use a single `screenshot`) and `comments` [{by, at, text}] added later by Gigi/John — read them all.
A new comment or screenshot on a Done item reopens it.

When an item is finished, set `status` to "Done" (or "In progress"), write a short plain-English
`dev_notes` ("Fixed — photos now show a preview before saving"), bump `updated`, and commit to the
`punch-list` branch only. Keep the JSON shape `{"items": [...]}`. Pull before pushing — the app writes to the same file.

## Stack
- Streamlit Community Cloud deploys `main` → `app.py`. Pages live in `views/`, helpers in `lib/`.
- Supabase holds photos (private bucket `vault`) and tables (`supabase/schema.sql`). Schema changes must be
  given to John as SQL to paste into the Supabase SQL editor.
- Secrets live only in Streamlit Cloud (see `.streamlit/secrets.toml.example`).
- `launcher/` is the source for the home-screen launcher page, published from the public repo
  `jjpvoskuil/vixen-vault-home` via GitHub Pages (Streamlit Cloud can't set its own home-screen icon).
- Home-screen icon: `lib/icon.py` injects apple-touch-icon/manifest tags into the *outer* Streamlit Cloud page
  (window.top, same origin), pointing at icon files on the launcher site. The launcher page is the fallback.
- Phone-first: test layouts at ~390px wide.
- John has no coding background — explain setup steps screen by screen.
