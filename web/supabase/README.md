# Supabase files for the web app

- `schema.sql` — tables + row-level security + photo-bucket rules. Re-runnable; John pastes it into SQL Editor.
  Verified on local PostgreSQL 16 (stub `auth.jwt()`, `anon`/`authenticated` roles, stub `storage.objects`) as
  signed-out, a stranger, a member and an admin. Redo that for any change before John runs it.
- `make_restore.py` — backup JSON → restore SQL (output contains private data: never commit).
- `make_fixtures.py` — Python closet rules → `web/src/lib/closet.fixtures.json` for the parity tests.
- The allow-list (who may sign in) is added by John with a one-off insert, never committed.
