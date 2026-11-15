// Supabase Edge Function "vault-ai": the only place the Anthropic key lives.
//   POST {action:"describe", item_id}                       → AI-describes one closet photo and saves it
//   POST {action:"outfits", style, style_desc, occasion, season, count} → outfits from her closet
//   POST {action:"shop", style, style_desc, occasion, season, budget, count} → what to buy next
//   POST {action:"guide"}                                     → {guide}: her colors + body shape + styles, saved on her profile
//   POST {action:"complete", item_ids, idea, style, occasion, season, count} → {looks, shopping}: finish & accessorize her outfit
//   POST {action:"tryon", body_photo_id, item_ids}           → {image, mime}: her photo wearing those pieces
//        (Google Gemini image model; key GEMINI_API_KEY, model GEMINI_IMAGE_MODEL — the app saves the result)
// Runs as the signed-in person (their sign-in token), so the database's row-level security applies: only
// approved people can read photos or change items. Each person has their own closet (column "owner"); every
// action works on body.owner (default: the signed-in person) — only an admin may name someone else.
// profile.wear = "mens" rewrites the prompts for a man's closet (ai.wearRequest). Logic lives in src/lib/ai.js (parity-tested vs Python).
// build_functions.mjs inlines ai.js + this file into index.ts (one file you can paste into the dashboard).

export function makeHandler({ createClient, fetchFn, env, ai }) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  const model = () => (env("ANTHROPIC_MODEL") || "claude-sonnet-5-5").trim();
  const publicKey = () => {
    const k = env("SUPABASE_ANON_KEY");
    if (k) return k;
    try { const all = JSON.parse(env("SUPABASE_PUBLISHABLE_KEYS") || "{}"); return Object.values(all)[0]; } catch { return undefined; }
  };

  class Friendly extends Error { constructor(msg, status = 502) { super(msg); this.status = status; } }

  function b64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  async function claude(req) {
    const key = (env("ANTHROPIC_API_KEY") || "").trim().replace(/^["']+|["']+$/g, "").trim(); // tolerate pasted quotes
    if (!key) throw new Friendly("The AI key isn't set — add ANTHROPIC_API_KEY under Supabase → Edge Functions → Secrets.", 500);
    for (let attempt = 0; ; attempt++) {
      const r = await fetchFn("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      if (r.ok) return await r.json();
      const text = await r.text();
      const low = text.toLowerCase();
      if ((r.status === 429 || r.status === 529 || r.status >= 500) && attempt < 3) {
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        continue;
      }
      if (r.status === 401) throw new Friendly("The Anthropic API key wasn't accepted — make a new key at platform.claude.com → Settings → API Keys and replace ANTHROPIC_API_KEY in Supabase → Edge Functions → Secrets.");
      if (low.includes("credit balance") || low.includes("billing")) throw new Friendly("The Anthropic account is out of credit — add credit at platform.claude.com/settings/billing.");
      if (r.status === 404 || (low.includes("model") && low.includes("not found"))) throw new Friendly(`The AI model name isn't recognized (${model()}) — check ANTHROPIC_MODEL in Supabase secrets.`);
      if (r.status === 429 || r.status === 529) throw new Friendly("The AI service is busy — wait a minute and try again.", 503);
      throw new Friendly(`AI error ${r.status}: ${text.slice(0, 200)}`);
    }
  }

  async function ask(req, toolName) {
    for (let i = 0; i < 2; i++) {
      const data = ai.toolAnswer(await claude(req), toolName);
      if (data) return data;
    }
    throw new Friendly("The AI answered without filling in the details — please try again.");
  }

  const ok = (r) => { if (r.error) throw new Friendly(r.error.message, 400); return r.data; };

  /** Whose closet this request is about: the signed-in person, or (admins only) body.owner. */
  async function whose(sb, body) {
    const me = String(ok(await sb.rpc("me")) || "").toLowerCase();
    const owner = String(body.owner || me).trim().toLowerCase();
    if (owner !== me && !ok(await sb.rpc("is_admin"))) throw new Friendly("Only an admin can do that for someone else's closet.", 403);
    return owner;
  }
  const profileOf = async (sb, owner) => ok(await sb.from("profile").select("*").eq("owner", owner).maybeSingle()) || { owner };
  const stylesOf = async (sb, owner) => ok(await sb.from("styles").select("*").order("sort_order").order("name")).filter((s) => !s.owner || s.owner === owner);
  const itemsOf = async (sb, owner) => ok(await sb.from("items").select("*").eq("owner", owner).order("created_at", { ascending: false }));
  const askFor = (req, profile, tool) => ask(ai.wearRequest(req, profile), tool);

  async function describe(sb, body, owner) {
    const item = ok(await sb.from("items").select("*").eq("id", body.item_id).eq("owner", owner).maybeSingle());
    if (!item) throw new Friendly("That item wasn't found.", 404);
    if (!item.image_path) throw new Friendly("That item has no photo.", 400);
    const [styleRows, profile] = await Promise.all([stylesOf(sb, owner), profileOf(sb, owner)]);
    const styles = styleRows.map((s) => s.name);
    const dl = await sb.storage.from("vault").download(item.image_path);
    if (dl.error) throw new Friendly(`Couldn't open the photo: ${dl.error.message}`, 400);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const type = /^image\/(jpeg|png|webp|gif)$/.test(dl.data.type) ? dl.data.type : "image/jpeg";
    const fields = ai.cleanTag(await askFor(ai.tagRequest(b64(bytes), styles, model(), type), profile, "record_item"));
    const row = { ...ai.mergeDescribe(item, fields), updated_at: new Date().toISOString() };
    const saved = ok(await sb.from("items").update(row).eq("id", item.id).select("*").maybeSingle());
    return { item: saved };
  }

  const gemModel = () => (env("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image").trim();
  const BLOCKED = "Google's safety filter wouldn't make this picture. Try a different body photo (fully dressed, plain background) or leave out the most revealing piece.";

  async function gemini(req) {
    const key = (env("GEMINI_API_KEY") || "").trim().replace(/^["']+|["']+$/g, "").trim();
    if (!key) throw new Friendly("The try-on key isn't set — add GEMINI_API_KEY under Supabase → Edge Functions → Secrets.", 500);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(gemModel())}:generateContent`;
    for (let attempt = 0; ; attempt++) {
      const r = await fetchFn(url, { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body: JSON.stringify(req) });
      if (r.ok) return await r.json();
      const text = await r.text();
      const low = text.toLowerCase();
      const noBilling = low.includes("billing") || low.includes("free tier") || low.includes("limit: 0") || low.includes("free_tier");
      if ((r.status === 503 || r.status === 500 || (r.status === 429 && !noBilling)) && attempt < 2) {
        await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
        continue;
      }
      if (noBilling) throw new Friendly("Google says billing isn't on for the try-on key yet — in aistudio.google.com/apikey click “Set up billing” next to the key.");
      if (r.status === 400 && low.includes("api key")) throw new Friendly("Google didn't accept the try-on key — check GEMINI_API_KEY in Supabase secrets.");
      if (r.status === 403) throw new Friendly("Google refused the try-on key (403) — make sure it's from the Vixen Vault project and billing is on.");
      if (r.status === 404) throw new Friendly(`Google doesn't recognize the image model (${gemModel()}) — set GEMINI_IMAGE_MODEL in Supabase secrets.`);
      if (r.status === 429) throw new Friendly("The try-on service is busy — wait a minute and try again.", 503);
      throw new Friendly(`Try-on error ${r.status}: ${text.slice(0, 200)}`);
    }
  }

  async function photoB64(sb, path) {
    const dl = await sb.storage.from("vault").download(path);
    if (dl.error) throw new Friendly(`Couldn't open a photo: ${dl.error.message}`, 400);
    const mime = /^image\/(jpeg|png|webp)$/.test(dl.data.type) ? dl.data.type : "image/jpeg";
    return { b64: b64(new Uint8Array(await dl.data.arrayBuffer())), mime };
  }

  async function tryon(sb, body, owner) {
    const ids = [...new Set((body.item_ids || []).map(String))];
    if (!ids.length) throw new Friendly("Pick at least one piece to try on.", 400);
    if (ids.length > 8) throw new Friendly("That's a lot of pieces — try on 8 or fewer at a time.", 400);
    const photo = ok(await sb.from("body_photos").select("*").eq("id", body.body_photo_id).eq("owner", owner).maybeSingle());
    if (!photo) throw new Friendly("Add a body photo first (Me → Body photos).", 400);
    const found = ok(await sb.from("items").select("*").eq("owner", owner).in("id", ids));
    const profile = await profileOf(sb, owner);
    const items = ai.tryonOrder(found.filter((i) => i.image_path));
    if (!items.length) throw new Friendly("Those pieces have no photos.", 400);
    const [bodyImg, ...itemImgs] = await Promise.all([photoB64(sb, photo.image_path), ...items.map((i) => photoB64(sb, i.image_path))]);
    const res = ai.readImage(await gemini(ai.tryonRequest(ai.forWear(ai.tryonPrompt(items), profile.wear), bodyImg, itemImgs, body.size === "2K" ? "2K" : "1K")));
    if (res.blocked) throw new Friendly(/safety|prohibited|blocklist|spii|other|image_/i.test(res.blocked) ? BLOCKED : "Google didn't return a picture this time — please try again.", 422);
    return { image: res.image, mime: res.mime, item_ids: items.map((i) => i.id) };
  }

  async function shop(sb, body, owner) {
    const [items, profile, styles] = await Promise.all([itemsOf(sb, owner), profileOf(sb, owner), stylesOf(sb, owner)]);
    const usable = items.filter((i) => !ai.isUntagged(i));
    if (usable.length < 4) throw new Friendly("Describe a few more pieces first — suggestions need at least 4 described items.", 400);
    const style = String(body.style || "").trim();
    const opts = {
      style, styleDesc: style ? (body.style_desc ?? (styles.find((s) => s.name === style)?.description || "")) : "",
      occasion: String(body.occasion || ""), season: String(body.season || ""), budget: String(body.budget || ""),
      count: Math.min(8, Math.max(2, parseInt(body.count, 10) || 6)),
    };
    const res = ai.readShop(await askFor(ai.shopRequest(usable, profile, opts, model()), profile, "suggest_purchases"), usable);
    return { ...res, suggestions: res.suggestions.map((s) => ({ ...s, pairs_with: s.pairs_with.map((i) => i.id) })) };
  }

  async function outfits(sb, body, owner) {
    const [items, profile, styles] = await Promise.all([itemsOf(sb, owner), profileOf(sb, owner), stylesOf(sb, owner)]);
    const usable = items.filter((i) => !ai.isUntagged(i));
    if (usable.length < 4) throw new Friendly("Describe a few more pieces first — outfits need at least 4 described items.", 400);
    const style = String(body.style || "").trim();
    if (!style) throw new Friendly("Pick a style first.", 400);
    const desc = body.style_desc ?? (styles.find((s) => s.name === style)?.description || "");
    const count = Math.min(6, Math.max(1, parseInt(body.count, 10) || 4));
    const req = ai.outfitRequest(usable, profile, style, desc, String(body.occasion || ""), String(body.season || ""), count, model());
    const res = ai.readOutfits(await askFor(req, profile, "propose_outfits"), usable);
    return { outfits: res.outfits.map((o) => ({ ...o, items: o.items.map((i) => i.id) })), closet_gaps: res.closet_gaps };
  }

  async function guide(sb, body, owner) {
    const [profile, styles, ps] = await Promise.all([profileOf(sb, owner), stylesOf(sb, owner),
      sb.from("body_photos").select("*").eq("owner", owner).order("created_at").then(ok)]);
    // A face close-up for coloring (if she has one) and a front photo for proportions.
    const pick = [ps.find((p) => p.label === "Face"), ps.find((p) => p.label === "Front") || ps.find((p) => p.label !== "Face")].filter(Boolean);
    const m = profile.measurements || {};
    if (!pick.length && !(m.bust && m.waist && m.hips)) throw new Friendly("Add your bust, waist and hip measurements or a body photo first.", 400);
    const imgs = await Promise.all(pick.map(async (p) => ({ label: p.label, ...(await photoB64(sb, p.image_path)) })));
    const g = ai.readGuide(await askFor(ai.guideRequest(profile, styles, imgs, model()), profile, "record_style_guide"));
    ok(await sb.from("profile").upsert({ owner, guide: g, updated_at: new Date().toISOString() }, { onConflict: "owner" }));
    return { guide: g };
  }

  async function complete(sb, body, owner) {
    const [all, profile, styles] = await Promise.all([itemsOf(sb, owner), profileOf(sb, owner), stylesOf(sb, owner)]);
    const usable = all.filter((i) => !ai.isUntagged(i));
    const ids = [...new Set((body.item_ids || []).map(String))].slice(0, 6);
    const waiting = all.filter((i) => ids.includes(String(i.id)) && ai.isUntagged(i));
    if (waiting.length) throw new Friendly(`Describe “${waiting[0].name || "that piece"}” first (tap it in the Closet → Describe).`, 400);
    const starts = usable.filter((i) => ids.includes(String(i.id)));
    const idea = String(body.idea || "").trim().slice(0, 500);
    if (!starts.length && !idea) throw new Friendly("Pick a piece or two, or describe your idea.", 400);
    if (usable.length < 2) throw new Friendly("Describe a few more pieces first.", 400);
    const style = String(body.style || "").trim();
    const opts = { idea, style, styleDesc: style ? (styles.find((s) => s.name === style)?.description || "") : "",
      occasion: String(body.occasion || ""), season: String(body.season || ""), count: Math.min(3, Math.max(1, parseInt(body.count, 10) || 2)) };
    const res = ai.readComplete(await askFor(ai.completeRequest(usable, profile, starts, opts, model()), profile, "complete_outfit"), usable, starts);
    return {
      looks: res.looks.map((o) => ({ ...o, items: o.items.map((i) => i.id), accessories: o.accessories.map((a) => ({ idea: a.idea, item_id: a.item?.id || null })) })),
      shopping: res.shopping,
    };
  }

  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return reply(405, { error: "POST only" });
    try {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) return reply(401, { error: "Please sign in." });
      const sb = createClient(env("SUPABASE_URL"), publicKey(), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const approved = ok(await sb.rpc("is_approved"));
      if (!approved) return reply(403, { error: "This account isn't on the Vixen Vault list." });
      const body = await req.json().catch(() => ({}));
      const fns = { describe, outfits, shop, tryon, guide, complete };
      const fn = Object.hasOwn(fns, body.action) ? fns[body.action] : null;
      if (!fn) return reply(400, { error: "Unknown action" });
      return reply(200, await fn(sb, body, await whose(sb, body)));
    } catch (e) {
      return reply(e.status || 500, { error: e.message || String(e) });
    }
  };
}
