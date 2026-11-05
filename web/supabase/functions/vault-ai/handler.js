// Supabase Edge Function "vault-ai": the only place the Anthropic key lives.
//   POST {action:"describe", item_id}                       → AI-describes one closet photo and saves it
//   POST {action:"outfits", style, style_desc, occasion, season, count} → outfits from her closet
// Runs as the signed-in person (their sign-in token), so the database's row-level security applies: only
// approved people can read photos or change items. Logic lives in src/lib/ai.js (parity-tested vs Python).
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
    const key = (env("ANTHROPIC_API_KEY") || "").trim();
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

  async function describe(sb, body) {
    const item = ok(await sb.from("items").select("*").eq("id", body.item_id).maybeSingle());
    if (!item) throw new Friendly("That item wasn't found.", 404);
    if (!item.image_path) throw new Friendly("That item has no photo.", 400);
    const styles = ok(await sb.from("styles").select("name").order("sort_order").order("name")).map((s) => s.name);
    const dl = await sb.storage.from("vault").download(item.image_path);
    if (dl.error) throw new Friendly(`Couldn't open the photo: ${dl.error.message}`, 400);
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const type = /^image\/(jpeg|png|webp|gif)$/.test(dl.data.type) ? dl.data.type : "image/jpeg";
    const fields = ai.cleanTag(await ask(ai.tagRequest(b64(bytes), styles, model(), type), "record_item"));
    const row = { ...ai.mergeDescribe(item, fields), updated_at: new Date().toISOString() };
    const saved = ok(await sb.from("items").update(row).eq("id", item.id).select("*").maybeSingle());
    return { item: saved };
  }

  async function outfits(sb, body) {
    const [items, prof, styles] = await Promise.all([
      sb.from("items").select("*").order("created_at", { ascending: false }),
      sb.from("profile").select("*").eq("id", 1).maybeSingle(),
      sb.from("styles").select("name,description"),
    ]);
    const usable = ok(items).filter((i) => !ai.isUntagged(i));
    if (usable.length < 4) throw new Friendly("Describe a few more pieces first — outfits need at least 4 described items.", 400);
    const style = String(body.style || "").trim();
    if (!style) throw new Friendly("Pick a style first.", 400);
    const desc = body.style_desc ?? (ok(styles).find((s) => s.name === style)?.description || "");
    const count = Math.min(6, Math.max(1, parseInt(body.count, 10) || 4));
    const req = ai.outfitRequest(usable, ok(prof) || {}, style, desc, String(body.occasion || ""), String(body.season || ""), count, model());
    const res = ai.readOutfits(await ask(req, "propose_outfits"), usable);
    return { outfits: res.outfits.map((o) => ({ ...o, items: o.items.map((i) => i.id) })), closet_gaps: res.closet_gaps };
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
      if (body.action === "describe") return reply(200, await describe(sb, body));
      if (body.action === "outfits") return reply(200, await outfits(sb, body));
      return reply(400, { error: "Unknown action" });
    } catch (e) {
      return reply(e.status || 500, { error: e.message || String(e) });
    }
  };
}
