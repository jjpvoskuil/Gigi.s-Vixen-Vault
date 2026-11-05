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
      let rows = (db[table] || []).filter((r) => st.filters.every(([k, v]) => r[k] === v));
      if (st.op === "update") { rows.forEach((r) => Object.assign(r, st.row)); calls.push(["update", table, st.row]); }
      return { data: st.single ? rows[0] ?? null : rows.map((r) => ({ ...r })), error: null };
    };
    const b = {
      select() { return b; }, order() { return b; }, eq(k, v) { st.filters.push([k, v]); return b; },
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
