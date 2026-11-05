// Supabase Edge Function "vault-punch": the Punch List. The GitHub key lives only here (secret GITHUB_TOKEN).
// Reads/writes punch_list.json on the repo's punch-list branch — the same file the Streamlit app used and that
// Claude reads at the start of each session. Only approved people (app_users) can use it.
//   POST {action:"list"}                                   → {items}
//   POST {action:"add", fields, shot?}                     → {item}      (shot = base64 JPEG)
//   POST {action:"edit", id, fields?, comment?, shot?}     → {item}
//   POST {action:"status", id, status}                     → {item}
//   POST {action:"delete", id}                             → {ok:true}
//   POST {action:"shot", path}                             → {data}      (base64 JPEG)
// Rules live in src/lib/punch.js; build_functions.mjs inlines both files into index.ts.

export function makePunchHandler({ createClient, fetchFn, env, punch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  const publicKey = () => {
    const k = env("SUPABASE_ANON_KEY");
    if (k) return k;
    try { return Object.values(JSON.parse(env("SUPABASE_PUBLISHABLE_KEYS") || "{}"))[0]; } catch { return undefined; }
  };
  class Friendly extends Error { constructor(msg, status = 502) { super(msg); this.status = status; } }
  class Conflict extends Error {}

  const FILE = "punch_list.json";
  const repo = () => (env("GITHUB_REPO") || "jjpvoskuil/Gigi.s-Vixen-Vault").trim();
  const branch = () => (env("GITHUB_BRANCH") || "punch-list").trim();
  const api = (path) => `https://api.github.com/repos/${repo()}/${path}`;

  async function gh(path, opts = {}) {
    const token = (env("GITHUB_TOKEN") || "").trim();
    if (!token) throw new Friendly("The punch list's GitHub key isn't set — add GITHUB_TOKEN under Supabase → Edge Functions → Secrets.", 500);
    const r = await fetchFn(api(path), {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "vixen-vault", ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) },
    });
    if (r.status === 401) throw new Friendly("GitHub didn't accept the punch list key — make a new one and replace GITHUB_TOKEN in Supabase secrets.");
    if (r.status === 403 && !(await r.clone().text()).toLowerCase().includes("rate limit")) {
      throw new Friendly("The GitHub key can't write to the repo — it needs Contents: Read and write for Gigi.s-Vixen-Vault.");
    }
    return r;
  }

  async function ensureBranch() {
    const r = await gh(`git/ref/heads/${branch()}`);
    if (r.ok) return;
    const main = await gh("git/ref/heads/main");
    if (!main.ok) throw new Friendly(`GitHub error ${main.status} finding the repo — check GITHUB_REPO.`);
    const sha = (await main.json()).object.sha;
    const made = await gh("git/refs", { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch()}`, sha }) });
    if (!made.ok && made.status !== 422) throw new Friendly(`GitHub error ${made.status} creating the punch-list branch.`);
  }

  async function read() {
    const r = await gh(`contents/${FILE}?ref=${encodeURIComponent(branch())}`);
    if (r.status === 404) return { items: [], sha: null };
    if (!r.ok) throw new Friendly(`GitHub error ${r.status} reading the punch list.`);
    const body = await r.json();
    const data = JSON.parse(punch.b64ToText(body.content || "") || "{}");
    return { items: data.items || [], sha: body.sha };
  }

  async function write(items, sha, message) {
    const payload = { message, branch: branch(), content: punch.textToB64(punch.fileText(items)) };
    if (sha) payload.sha = sha;
    const r = await gh(`contents/${FILE}`, { method: "PUT", body: JSON.stringify(payload) });
    if (r.status === 409 || r.status === 422) throw new Conflict();
    if (!r.ok) throw new Friendly(`GitHub error ${r.status} saving the punch list.`);
  }

  /** Read-modify-write; retries if someone (e.g. Claude) saved in between. */
  async function modify(fn, message) {
    await ensureBranch();
    for (let attempt = 0; attempt < 4; attempt++) {
      const { items, sha } = await read();
      const out = fn(items);
      try { await write(items, sha, message); return out; }
      catch (e) { if (!(e instanceof Conflict)) throw e; await sleep(600 * (attempt + 1)); }
    }
    throw new Friendly("Couldn't save — someone else was saving at the same moment. Please try again.", 409);
  }

  async function uploadShot(itemId, b64) {
    if (!b64) return null;
    if (b64.length > 4_000_000) throw new Friendly("That screenshot is too big.", 400);
    await ensureBranch();
    const path = punch.shotPath(itemId);
    const r = await gh(`contents/${path}`, { method: "PUT", body: JSON.stringify({ message: `Screenshot for punch item ${itemId}`, branch: branch(), content: b64 }) });
    if (!r.ok) throw new Friendly(`GitHub error ${r.status} saving the screenshot.`);
    return path;
  }

  const actions = {
    async list() { await ensureBranch(); return { items: (await read()).items }; },
    async add(b) {
      if (!String(b.fields?.title || "").trim()) throw new Friendly("Say what should change first.", 400);
      const id = punch.newId();
      const shot = await uploadShot(id, b.shot);
      const item = punch.newItem(b.fields, shot ? [shot] : [], id);
      await modify((items) => { items.push(item); }, `Punch list: add “${item.title.slice(0, 60)}”`);
      return { item };
    },
    async edit(b) {
      const shot = await uploadShot(b.id, b.shot);
      const item = await modify((items) => punch.applyEdit(items, b.id, { fields: b.fields || {}, shot, comment: b.comment }), `Punch list: edit ${b.id}`);
      return { item };
    },
    async status(b) {
      return { item: await modify((items) => punch.applyStatus(items, b.id, b.status), `Punch list: update ${b.id}`) };
    },
    async delete(b) {
      await modify((items) => { const n = items.findIndex((x) => x.id === b.id); if (n >= 0) items.splice(n, 1); }, `Punch list: delete ${b.id}`);
      return { ok: true };
    },
    async shot(b) {
      if (!/^screenshots\/[\w.-]+$/.test(String(b.path || ""))) throw new Friendly("Bad screenshot path.", 400);
      const r = await gh(`contents/${b.path}?ref=${encodeURIComponent(branch())}`);
      if (!r.ok) throw new Friendly(`Couldn't load the screenshot (GitHub ${r.status}).`, r.status === 404 ? 404 : 502);
      const body = await r.json();
      let data = (body.content || "").replace(/\s/g, "");
      if (!data && body.git_url) { // files over 1 MB come back without content; fetch the blob instead
        const blob = await gh(`git/blobs/${body.sha}`);
        data = ((await blob.json()).content || "").replace(/\s/g, "");
      }
      return { data };
    },
  };

  return async function handle(req) {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return reply(405, { error: "POST only" });
    try {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) return reply(401, { error: "Please sign in." });
      const sb = createClient(env("SUPABASE_URL"), publicKey(), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
      const { data: approved, error } = await sb.rpc("is_approved");
      if (error) throw new Friendly(error.message, 400);
      if (!approved) return reply(403, { error: "This account isn't on the Vixen Vault list." });
      const body = await req.json().catch(() => ({}));
      const fn = Object.hasOwn(actions, body.action) ? actions[body.action] : null;
      if (!fn) return reply(400, { error: "Unknown action" });
      return reply(200, await fn(body));
    } catch (e) {
      return reply(e.status || 500, { error: e.message || String(e) });
    }
  };
}
