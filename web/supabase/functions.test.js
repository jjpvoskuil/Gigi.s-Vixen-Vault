import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ai from "../src/lib/ai.js";
import { makeHandler } from "./functions/vault-ai/handler.js";
import { buildVaultAi } from "./build_functions.mjs";

// ---- a tiny stand-in for supabase-js (query builder + storage + rpc)
function fakeSupabase(db, { approved = true, photo = new Uint8Array([1, 2, 3]) } = {}) {
  const calls = [];
  const q = (table) => {
    const st = { table, filters: [], op: "select", row: null, single: false };
    const run = () => {
      let rows = (db[table] || []).filter((r) => st.filters.every(([k, v]) => r[k] === v) && (!st.ins || st.ins[1].includes(r[st.ins[0]])));
      if (st.op === "update") { rows.forEach((r) => Object.assign(r, st.row)); calls.push(["update", table, st.row]); }
      return { data: st.single ? rows[0] ?? null : rows.map((r) => ({ ...r })), error: null };
    };
    const b = {
      select() { return b; }, order() { return b; }, eq(k, v) { st.filters.push([k, v]); return b; },
      in(k, vs) { st.ins = [k, vs]; return b; },
      update(row) { st.op = "update"; st.row = row; return b; }, maybeSingle() { st.single = true; return b; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  };
  return {
    calls, client: () => ({
      from: q,
      rpc: async (name) => ({ data: name === "is_approved" ? approved : null, error: null }),
      storage: { from: () => ({ download: async (p) => ({ data: new Blob([photo], { type: "image/jpeg" }), error: null }) }) },
    }),
  };
}

const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", ANTHROPIC_API_KEY: "sk-ant-test", ANTHROPIC_MODEL: "model-x" };
const env = (over = {}) => (k) => ({ ...ENV, ...over })[k];
const post = (body, auth = "Bearer user-jwt") => new Request("https://f/vault-ai", { method: "POST", headers: auth ? { Authorization: auth } : {}, body: JSON.stringify(body) });
const anthropic = (answers, log = []) => async (url, init) => {
  log.push(JSON.parse(init.body));
  const a = answers.shift();
  if (a.status) return new Response(a.text || "", { status: a.status });
  return new Response(JSON.stringify(a), { status: 200 });
};
const toolUse = (name, input) => ({ content: [{ type: "tool_use", name, input }] });

function closet() {
  return {
    items: [
      { id: "u1", name: "New item", description: "black top from Target", brand: "Target", notes: "", image_path: "items/u1.jpg", category: "other" },
      ...Array.from({ length: 5 }, (_, n) => ({ id: `t${n}`, name: `Piece ${n}`, description: "ok", category: "top", colors: ["red"] })),
    ],
    styles: [{ name: "Edgy", description: "Leather", sort_order: 1 }, { name: "Boho", description: "", sort_order: 2 }],
    profile: [{ id: 1, measurements: { bust: 36 }, sizes: {}, my_styles: ["Edgy"] }],
  };
}

test("must be signed in and approved", async () => {
  const sb = fakeSupabase(closet(), { approved: false });
  const h = makeHandler({ createClient: sb.client, fetchFn: anthropic([]), env: env(), ai });
  assert.equal((await h(post({ action: "describe", item_id: "u1" }, null))).status, 401);
  const r = await h(post({ action: "describe", item_id: "u1" }));
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /isn't on the Vixen Vault list/);
});

test("describe: sends the photo, keeps her own text, saves", async () => {
  const db = closet(), sb = fakeSupabase(db), log = [];
  const h = makeHandler({ createClient: sb.client, fetchFn: anthropic([toolUse("record_item", {
    name: "Black lace cami", category: "blouse", brand: "Gap", description: "Silky cami.", colors: ["black"] })], log), env: env(), ai });
  const r = await h(post({ action: "describe", item_id: "u1" }));
  assert.equal(r.status, 200);
  const item = (await r.json()).item;
  assert.equal(item.name, "Black lace cami");
  assert.equal(item.category, "other");            // unknown category cleaned
  assert.equal(item.brand, "Target");              // her brand kept
  assert.equal(item.notes, "black top from Target"); // her description moved to notes
  assert.equal(item.description, "Silky cami.");
  const req = log[0];
  assert.deepEqual(req, ai.tagRequest(btoa(String.fromCharCode(1, 2, 3)), ["Edgy", "Boho"], "model-x"));
});

test("describe: retries once when the AI answers in prose", async () => {
  const sb = fakeSupabase(closet());
  const h = makeHandler({ createClient: sb.client, fetchFn: anthropic([{ content: [{ type: "text", text: "Sure!" }] },
    toolUse("record_item", { name: "Cami", category: "top", description: "x" })]), env: env(), ai });
  assert.equal((await h(post({ action: "describe", item_id: "u1" }))).status, 200);
});

test("friendly errors: bad key, no credit, missing key", async () => {
  const mk = (ans, e = env()) => makeHandler({ createClient: fakeSupabase(closet()).client, fetchFn: anthropic(ans), env: e, ai });
  let r = await mk([{ status: 401, text: "invalid x-api-key" }])(post({ action: "describe", item_id: "u1" }));
  assert.match((await r.json()).error, /key wasn't accepted/);
  r = await mk([{ status: 400, text: "Your credit balance is too low" }])(post({ action: "describe", item_id: "u1" }));
  assert.match((await r.json()).error, /out of credit/);
  r = await mk([], env({ ANTHROPIC_API_KEY: "" }))(post({ action: "describe", item_id: "u1" }));
  assert.match((await r.json()).error, /AI key isn't set/);
});

test("outfits: uses described pieces only and returns item ids", async () => {
  const log = [];
  const h = makeHandler({ createClient: fakeSupabase(closet()).client, fetchFn: anthropic([toolUse("propose_outfits", {
    outfits: [{ title: "Night", items: [1, 2, 9], why: "w", tip: "t", add_piece: "" }], closet_gaps: ["red heels"] })], log), env: env(), ai });
  const r = await h(post({ action: "outfits", style: "Edgy", occasion: "date", season: "fall", count: 3 }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { outfits: [{ title: "Night", items: ["t0", "t1"], why: "w", tip: "t", add_piece: "" }], closet_gaps: ["red heels"] });
  const usable = closet().items.filter((i) => !ai.isUntagged(i));
  assert.deepEqual(log[0], ai.outfitRequest(usable, closet().profile[0], "Edgy", "Leather", "date", "fall", 3, "model-x"));
});

test("the pasteable index.ts is up to date and loads", async () => {
  const built = buildVaultAi();
  assert.equal(readFileSync(new URL("./functions/vault-ai/index.ts", import.meta.url), "utf8"), built,
    "run: node supabase/build_functions.mjs");
  const dir = mkdtempSync(join(tmpdir(), "fn-"));
  const f = join(dir, "check.mjs");
  writeFileSync(f, built.replace(/^import .*$/m, "const createClient = () => null;")
    .replace(/^Deno\.serve\(.*$/m, "export const ok = typeof makeHandler === 'function';"));
  assert.equal((await import(f)).ok, true);
});

// ---------------------------------------------------------------- try-on
const gem = (answers, log = []) => async (url, init) => {
  log.push({ url, headers: init.headers, body: JSON.parse(init.body) });
  const a = answers.shift();
  if (a.status) return new Response(a.text || "", { status: a.status });
  return new Response(JSON.stringify(a), { status: 200 });
};
const picture = { candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { mimeType: "image/png", data: "UE5H" } }] }, finishReason: "STOP" }] };
function wardrobe() {
  const c = closet();
  c.items.push({ id: "shoe", name: "Buckled stilettos", category: "shoes", image_path: "items/shoe.jpg", primary_color: "black" },
    { id: "top", name: "Lace bodysuit", category: "top", image_path: "items/top.jpg", pattern: "lace" },
    { id: "jeans", name: "Wet-look leggings", category: "bottom", image_path: "items/jeans.jpg" });
  c.body_photos = [{ id: "b1", label: "Front", image_path: "body/b1.jpg" }];
  return c;
}

test("try-on: her photo first, pieces head to toe, Gemini key in header; returns the picture", async () => {
  const log = [];
  const h = makeHandler({ createClient: fakeSupabase(wardrobe()).client, fetchFn: gem([picture], log), env: env({ GEMINI_API_KEY: "\"gem-key\"" }), ai });
  const r = await h(post({ action: "tryon", body_photo_id: "b1", item_ids: ["shoe", "jeans", "top", "shoe"] }));
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.deepEqual(out, { image: "UE5H", mime: "image/png", item_ids: ["top", "jeans", "shoe"] });
  assert.match(log[0].url, /models\/gemini-3\.1-flash-image:generateContent$/);
  assert.equal(log[0].headers["x-goog-api-key"], "gem-key", "quotes stripped");
  const parts = log[0].body.contents[0].parts;
  assert.equal(parts.length, 5);
  assert.match(parts[0].text, /Image 2: top — Lace bodysuit, lace\nImage 3: bottom — Wet-look leggings\nImage 4: shoes — Buckled stilettos, main color black/);
  assert.deepEqual(log[0].body.generationConfig, { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4", imageSize: "1K" } });
});

test("try-on: friendly errors (no key, no billing, safety block, no body photo)", async () => {
  const run = async (answers, body, over = { GEMINI_API_KEY: "k" }) => {
    const h = makeHandler({ createClient: fakeSupabase(wardrobe()).client, fetchFn: gem(answers), env: env(over), ai });
    const r = await h(post({ action: "tryon", body_photo_id: "b1", item_ids: ["top"], ...body }));
    return [r.status, (await r.json()).error];
  };
  assert.match((await run([], {}, {}))[1], /GEMINI_API_KEY/);
  assert.match((await run([{ status: 429, text: "Quota exceeded for metric generate_content_free_tier_requests, limit: 0" }], {}))[1], /billing/);
  assert.match((await run([{ promptFeedback: { blockReason: "PROHIBITED_CONTENT" } }], {}))[1], /safety filter/);
  assert.match((await run([{ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] }], {}))[1], /safety filter/);
  assert.match((await run([], { body_photo_id: "nope" }))[1], /body photo/);
  assert.match((await run([], { item_ids: [] }))[1], /at least one/);
  const [st] = await run([{ status: 503 }, picture], {});
  assert.equal(st, 200, "retries a busy service");
});

// ---------------------------------------------------------------- shopping suggestions
test("shop rules: read answer, size-aware search link, prompt carries her focus", () => {
  const usable = [{ id: "a", name: "Tee" }, { id: "b", name: "Jeans" }];
  const r = ai.readShop({ summary: "s", suggestions: [
    { piece: " Tan ankle boots ", category: "shoes", color: "tan", why: "w", pairs_with: [1, 2, 2, 9, 0], new_looks: 5, priority: "must-have", search: "tan ankle boots" },
    { piece: "", category: "top" },
    { piece: "Belt", category: "belts?", pairs_with: [], new_looks: -1, priority: "??", search: "" },
  ], colors: [{ color: "emerald", why: "x" }, { why: "no color" }] }, usable);
  assert.equal(r.suggestions.length, 2);
  assert.deepEqual(r.suggestions[0].pairs_with.map((i) => i.id), ["a", "b"]);
  assert.equal(r.suggestions[0].piece, "Tan ankle boots");
  assert.deepEqual([r.suggestions[1].category, r.suggestions[1].new_looks, r.suggestions[1].priority, r.suggestions[1].search], ["other", 0, "nice to have", "Belt"]);
  assert.deepEqual(r.colors, [{ color: "emerald", why: "x" }]);
  assert.equal(ai.shopLink("tan ankle boots", "shoes", { shoes: "8.5" }), "https://www.google.com/search?tbm=shop&q=tan%20ankle%20boots%20women%20size%208.5");
  assert.equal(ai.shopLink("women's red belt", "accessory", { shoes: "8.5" }), "https://www.google.com/search?tbm=shop&q=women's%20red%20belt");
  const p = ai.shopPrompt(usable, { color_notes: "avoid mustard" }, { style: "Edgy", styleDesc: "Leather", budget: "mid", count: 3 });
  assert.match(p, /Style focus: Edgy — Leather/);
  assert.match(p, /Budget: mid-range/);
  assert.match(p, /avoid mustard/);
  assert.match(p, /Suggest up to 3 pieces/);
  assert.match(p, /1\. \{"name": "Tee"\}/);
});

test("shop action: uses described pieces only, returns ids", async () => {
  const log = [];
  const answer = toolUse("suggest_purchases", { summary: "Lots of tops.", suggestions: [
    { piece: "Black moto jacket", category: "outerwear", color: "black", why: "Edge.", pairs_with: [1, 2], new_looks: 4, priority: "must-have", search: "black moto jacket" }],
    colors: [{ color: "cobalt", why: "Pops." }] });
  const h = makeHandler({ createClient: fakeSupabase(closet()).client, fetchFn: anthropic([answer], log), env: env(), ai });
  const r = await h(post({ action: "shop", style: "Edgy", budget: "splurge", count: 3 }));
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.deepEqual(out.suggestions[0].pairs_with, ["t0", "t1"], "item u1 (undescribed) is not in the numbering");
  assert.equal(out.colors[0].color, "cobalt");
  const req = log[0];
  assert.equal(req.tools[0].name, "suggest_purchases");
  assert.equal(req.tools[0].strict, true);
  assert.match(req.messages[0].content, /Style focus: Edgy — Leather/);
  assert.doesNotMatch(req.messages[0].content, /black top from Target/);
});
