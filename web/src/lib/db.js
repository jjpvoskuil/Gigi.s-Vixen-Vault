// One data API for every screen. Two backends with the same methods:
//   supabaseDb — the real data; who may read/write what is enforced by row-level security (supabase/schema.sql)
//   demoDb     — made-up data kept in this browser only (for ?demo and testing)
// Records keep the exact shapes the Streamlit app used (items, profile, body_photos, styles tables).
import { BUCKET } from "../config.js";

export const ITEM_FIELDS = ["name", "category", "subcategory", "primary_color", "colors", "pattern", "material", "fit",
  "formality", "seasons", "styles", "description", "brand", "size", "notes", "favorite", "times_worn"];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const nowIso = () => new Date().toISOString();
const lower = (e) => (e || "").trim().toLowerCase();
const URL_SECONDS = 6 * 3600;

// ---------------------------------------------------------------- Supabase
export function supabaseDb(sb, email) {
  const me = lower(email);
  const ok = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const urlCache = new Map(); // path -> {url, until}
  const bucket = () => sb.storage.from(BUCKET);
  async function callAi(body) {
    const { data, error } = await sb.functions.invoke("vault-ai", { body });
    if (!error) return data;
    let msg = error.message;
    try { const j = await error.context.json(); if (j?.error) msg = j.error; } catch { /* keep msg */ }
    if (/Failed to send|fetch/i.test(msg)) msg = "Couldn't reach the AI helper — check your connection (or it isn't set up in Supabase yet).";
    throw new Error(msg);
  }
  return {
    kind: "supabase", email: me,
    async whoami() { const u = ok(await sb.from("app_users").select("*").eq("email", me)); return u[0] || null; },
    listUsers: async () => ok(await sb.from("app_users").select("*").order("email")),
    saveUser: async (u) => ok(await sb.from("app_users").upsert({ email: lower(u.email), name: u.name || "", role: u.role || "member" })),
    deleteUser: async (e) => ok(await sb.from("app_users").delete().eq("email", lower(e))),

    listItems: async () => ok(await sb.from("items").select("*").order("created_at", { ascending: false })),
    saveItem: async (id, fields) => ok(await sb.from("items").update({ ...pick(fields, ITEM_FIELDS), updated_at: nowIso() }).eq("id", id)),
    deleteItem: async (item) => {
      ok(await sb.from("items").delete().eq("id", item.id));
      const paths = [item.image_path, item.thumb_path].filter(Boolean);
      if (paths.length) await bucket().remove(paths); // best effort, like the Python app
    },

    /** Upload both JPEGs, then add the item row. Returns the new item. */
    async addItem({ full, thumb }, stem, fields = {}) {
      const up = async (path, blob) => ok(await bucket().upload(path, blob, { contentType: "image/jpeg", upsert: false }));
      await up(`${stem}.jpg`, full);
      await up(`${stem}_thumb.jpg`, thumb);
      const row = { name: "New item", category: "other", ...pick(fields, ITEM_FIELDS), image_path: `${stem}.jpg`, thumb_path: `${stem}_thumb.jpg` };
      try { return ok(await sb.from("items").insert(row).select("*").single()); }
      catch (e) { await bucket().remove([row.image_path, row.thumb_path]); throw e; }
    },
    /** Ask the vault-ai server function to describe one item's photo. Returns the saved item. */
    describeItem: async (id) => (await callAi({ action: "describe", item_id: id })).item,
    /** Outfits from her closet: {outfits:[{title, items:[ids], why, tip, add_piece}], closet_gaps}. */
    suggestOutfits: (opts) => callAi({ action: "outfits", ...opts }),

    getProfile: async () => (ok(await sb.from("profile").select("*").eq("id", 1))[0] || { id: 1, measurements: {}, sizes: {}, my_styles: [] }),
    saveProfile: async (fields) => ok(await sb.from("profile").upsert({ ...fields, id: 1, updated_at: nowIso() })),
    listStyles: async () => ok(await sb.from("styles").select("*").order("sort_order").order("name")),
    listBodyPhotos: async () => ok(await sb.from("body_photos").select("*").order("created_at")),

    /** Temporary private links for photos: {path: url}. Cached until shortly before they expire. */
    async photoUrls(paths) {
      const want = [...new Set(paths.filter(Boolean))];
      const now = Date.now();
      const missing = want.filter((p) => !(urlCache.get(p)?.until > now));
      for (let i = 0; i < missing.length; i += 100) {
        const chunk = missing.slice(i, i + 100);
        const res = ok(await bucket().createSignedUrls(chunk, URL_SECONDS));
        for (const r of res) if (r.signedUrl) urlCache.set(r.path, { url: r.signedUrl, until: now + (URL_SECONDS - 600) * 1000 });
      }
      return Object.fromEntries(want.filter((p) => urlCache.has(p)).map((p) => [p, urlCache.get(p).url]));
    },
  };
}

// ---------------------------------------------------------------- demo (browser-only)
const DEMO_KEY = "vixenvault.demo.v1";
export function demoDb(seed) {
  let st;
  try { st = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { st = null; }
  if (!st) st = seed();
  const save = () => { try { localStorage.setItem(DEMO_KEY, JSON.stringify(st)); } catch { /* ignore */ } };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const me = "demo@example.com";
  return {
    kind: "demo", email: me,
    whoami: async () => st.users.find((u) => u.email === me) || null,
    listUsers: async () => clone(st.users),
    saveUser: async (u) => { st.users = st.users.filter((x) => x.email !== lower(u.email)).concat({ ...u, email: lower(u.email) }); save(); },
    deleteUser: async (e) => { st.users = st.users.filter((x) => x.email !== lower(e)); save(); },
    listItems: async () => clone(st.items),
    saveItem: async (id, fields) => { const it = st.items.find((x) => x.id === id); Object.assign(it, pick(fields, ITEM_FIELDS), { updated_at: nowIso() }); save(); },
    deleteItem: async (item) => { st.items = st.items.filter((x) => x.id !== item.id); save(); },
    async addItem({ thumb }, stem, fields = {}) {
      const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(thumb); });
      const it = { id: crypto.randomUUID(), created_at: nowIso(), updated_at: nowIso(), name: "New item", category: "other", subcategory: "",
        primary_color: "", colors: [], pattern: "", material: "", fit: "", formality: "", seasons: [], styles: [], description: "",
        brand: "", size: "", notes: "", favorite: false, times_worn: 0, ...pick(fields, ITEM_FIELDS),
        image_path: `${stem}.jpg`, thumb_path: `${stem}_thumb.jpg` };
      st.photos[it.image_path] = url; st.photos[it.thumb_path] = url;
      st.items.unshift(it); save(); return clone(it);
    },
    async describeItem(id) { // pretend AI, so the demo flow can be tried without a key
      await new Promise((r) => setTimeout(r, 900));
      const it = st.items.find((x) => x.id === id);
      Object.assign(it, { name: it.name === "New item" ? "Demo piece (pretend AI)" : it.name, category: it.category === "other" ? "top" : it.category,
        primary_color: "black", colors: ["black"], formality: "casual", seasons: ["fall"], styles: [st.styles[0]?.name].filter(Boolean),
        description: "Demo description — the real app asks the AI." });
      save(); return clone(it);
    },
    async suggestOutfits({ count = 4 }) { // pretend AI
      await new Promise((r) => setTimeout(r, 900));
      const by = (c) => st.items.filter((i) => i.category === c);
      const looks = [];
      for (let n = 0; n < count; n++) {
        const pick = (c) => by(c)[n % Math.max(1, by(c).length)];
        const pieces = n % 2 ? [pick("dress"), pick("shoes")] : [pick("top"), pick("bottom"), pick("shoes"), pick("outerwear")];
        looks.push({ title: `Demo look ${n + 1}`, items: pieces.filter(Boolean).map((i) => i.id), why: "Pretend reason — the real app asks the AI.",
          tip: "Pretend tip: tuck the front.", add_piece: n === 0 ? "silver statement cuff" : "" });
      }
      return { outfits: looks, closet_gaps: ["black ankle-strap heels", "cropped leather jacket"] };
    },
    getProfile: async () => clone(st.profile),
    saveProfile: async (fields) => { Object.assign(st.profile, fields); save(); },
    listStyles: async () => clone(st.styles),
    listBodyPhotos: async () => clone(st.body),
    photoUrls: async (paths) => Object.fromEntries(paths.filter(Boolean).map((p) => [p, st.photos[p] || ""])),
  };
}
