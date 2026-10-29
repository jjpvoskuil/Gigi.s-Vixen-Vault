# Gigi's Vixen Vault

A phone-first Streamlit app for Gigi's closet: photograph clothes, let AI describe and tag them,
keep her measurements, body photos and favorite styles — and (coming next) get outfit picks
and see them on her.

## What's built (stage 1)
- **Login** — one password. After logging in, use Chrome's ⋮ menu → *Add to Home screen*; the shortcut keeps her signed in.
- **Add** — snap or pick photos (several at once). Each is resized to 2000 px, stored privately, and described by Claude (type, colors, pattern, dressiness, seasons, styles).
- **Closet** — photo grid with search and filters; tap *Open* to edit details, mark favorites, log wears or delete.
- **Me** — measurements and sizes, full-length body photos (preview before saving), and a style menu she can add to.
- **Punch List** — log bugs, changes and ideas; Claude works from this list each session.
- **Phone icon** — custom fox-and-vault icon via a small launcher page (`launcher/`).

## Where things live
| What | Where |
|---|---|
| Code | this GitHub repo |
| Photos, closet records, profile | Supabase (private bucket `vault` + tables) |
| Passwords and API keys | Streamlit Cloud → app → Settings → Secrets (never in GitHub) |

## One-time setup
1. **Supabase** — create a free project at supabase.com. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**.
   Then **Project Settings → API Keys**: copy the **Project URL** and the **secret** key (or the legacy `service_role` key).
2. **Anthropic** — create an API key at console.anthropic.com.
3. **Streamlit Cloud** — *Create app* → this repo, branch `main`, main file `app.py`.
   Under **Advanced settings → Secrets**, paste the contents of `.streamlit/secrets.toml.example` with real values filled in.

## Roadmap
1. ✅ Closet inventory, profile, styles
2. Outfit picker — choose a style/occasion, get combinations from her closet with reasons
3. Try-on — render chosen outfits on her body photo
4. Gap finder — suggested new pieces and colors, visualized the same way
