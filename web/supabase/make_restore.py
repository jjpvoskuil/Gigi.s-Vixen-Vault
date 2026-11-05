"""Turn a backup (vixen-vault-data/backups/supabase/*.json, made by its backup workflow) into SQL that
replaces the database contents. Output contains private data — send it to John as a file, NEVER commit it.

    python web/supabase/make_restore.py <vixen-vault-data>/backups/supabase > vault_restore.sql

Run the schema first if the tables don't exist (fresh project), then paste the output into the SQL Editor.
Photos are restored separately (they are plain files under backups/photos/).
"""
import json
import sys
from pathlib import Path

ORDER = ["app_users", "styles", "profile", "items", "body_photos", "tryons", "punchlist"]  # parents before children
TEXT_ARRAYS = {"colors", "seasons", "styles", "my_styles"}  # text[] columns; dict/list elsewhere = jsonb
UUID_ARRAYS = {"item_ids"}


def lit(v, col):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if col in UUID_ARRAYS and isinstance(v, list):
        return "array[" + ",".join(lit(x, "") for x in v) + "]::uuid[]"
    if col in TEXT_ARRAYS and isinstance(v, list):
        return "array[" + ",".join(lit(x, "") for x in v) + "]::text[]"
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def main(folder):
    d = Path(folder)
    present = [t for t in ORDER if (d / f"{t}.json").exists()]
    out = ["-- Vixen Vault restore (generated from a backup). Contains private data — do not commit.", "begin;"]
    out += [f"delete from public.{t};" for t in reversed(present)]
    counts = {}
    for t in present:
        rows = json.loads((d / f"{t}.json").read_text())
        counts[t] = len(rows)
        for r in rows:
            cols = sorted(r)
            out.append(f"insert into public.{t} ({', '.join(cols)}) values ({', '.join(lit(r[c], c) for c in cols)});")
    out.append("commit;")
    out.append("select 'Restored " + ", ".join(f"{n} {t}" for t, n in counts.items()) + "' as result;")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1])
