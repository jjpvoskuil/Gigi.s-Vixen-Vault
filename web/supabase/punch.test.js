import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as punch from "../src/lib/punch.js";
import { makePunchHandler } from "./functions/vault-punch/handler.js";
import { buildVaultPunch } from "./build_functions.mjs";

// ---------------------------------------------------------------- rules
test("new item has the Streamlit shape", () => {
  const it = punch.newItem({ title: "  Fix photos ", type: "Bug", priority: "High", page: "Add", added_by: "Gigi" }, ["screenshots/a.jpg"], "abcd1234", "T");
  assert.deepEqual(it, { id: "abcd1234", created: "T", updated: "T", type: "Bug", page: "Add", priority: "High", title: "Fix photos",
    details: "", added_by: "Gigi", status: "Open", screenshots: ["screenshots/a.jpg"], comments: [], dev_notes: "" });
  assert.equal(punch.newItem({ title: "x", type: "??", priority: "??" }).type, "Change");
});

test("note or screenshot reopens a finished item; old single screenshot is kept", () => {
  const items = [{ id: "a", status: "Done", screenshot: "screenshots/old.jpg", title: "t" }];
  punch.applyEdit(items, "a", { comment: { by: "John", text: " still broken " }, shot: "screenshots/new.jpg" }, "T2");
  assert.equal(items[0].status, "Open");
  assert.deepEqual(items[0].screenshots, ["screenshots/old.jpg", "screenshots/new.jpg"]);
  assert.equal(items[0].screenshot, undefined);
  assert.deepEqual(items[0].comments, [{ by: "John", at: "T2", text: "still broken" }]);
  punch.applyEdit(items, "a", { fields: { title: " new ", status: "Done", dev_notes: "x" } });
  assert.equal(items[0].title, "new");
  assert.equal(items[0].dev_notes, undefined, "only title/details/type/page/priority are editable");
  assert.throws(() => punch.applyEdit(items, "zz", {}), /wasn't found/);
});

test("sort: open High first then oldest; closed newest first", () => {
  const items = [
    { id: 1, status: "Open", priority: "Normal", created: "2" }, { id: 2, status: "Open", priority: "High", created: "3" },
    { id: 3, status: "In progress", priority: "Normal", created: "1" }, { id: 4, status: "Done", updated: "5" }, { id: 5, status: "Won't do", updated: "9" },
  ];
  const { open, closed } = punch.sortItems(items);
  assert.deepEqual(open.map((i) => i.id), [2, 3, 1]);
  assert.deepEqual(closed.map((i) => i.id), [5, 4]);
});

test("base64 text round-trip keeps emoji/accents; file layout like Python indent=2", () => {
  const s = "Café 🐞 “quotes”";
  assert.equal(punch.b64ToText(punch.textToB64(s)), s);
  assert.equal(punch.fileText([{ a: 1, b: [] }]), '{\n  "items": [\n    {\n      "a": 1,\n      "b": []\n    }\n  ]\n}');
});

// ---------------------------------------------------------------- handler, with a stand-in GitHub
function fakeGitHub({ items = [], branch = true, conflicts = 0 } = {}) {
  const st = { files: {}, branch, conflicts, log: [] };
  if (items) st.files["punch_list.json"] = { content: punch.textToB64(punch.fileText(items)), sha: "s0" };
  let n = 0;
  const fetchFn = async (url, init = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace("/repos/jjpvoskuil/Gigi.s-Vixen-Vault/", "");
    const method = init.method || "GET";
    st.log.push(`${method} ${path}`);
    const json = (status, body) => new Response(JSON.stringify(body), { status });
    if (path === "git/ref/heads/punch-list") return st.branch ? json(200, {}) : json(404, {});
    if (path === "git/ref/heads/main") return json(200, { object: { sha: "m1" } });
    if (path === "git/refs" && method === "POST") { st.branch = true; return json(201, {}); }
    if (path.startsWith("contents/")) {
      const f = path.slice(9);
      if (method === "GET") return st.files[f] ? json(200, { content: st.files[f].content, sha: st.files[f].sha }) : json(404, {});
      if (method === "PUT") {
        const body = JSON.parse(init.body);
        assert.equal(body.branch, "punch-list");
        if (f === "punch_list.json" && st.conflicts > 0) { st.conflicts--; st.files[f].sha = `other${n}`; return json(409, {}); }
        if (st.files[f] && body.sha !== st.files[f].sha) return json(409, {});
        st.files[f] = { content: body.content, sha: `s${++n}` };
        return json(200, {});
      }
    }
    return json(500, { path });
  };
  return { st, fetchFn, items: () => JSON.parse(punch.b64ToText(st.files["punch_list.json"].content)).items };
}
const sbFake = (approved = true) => () => ({ rpc: async () => ({ data: approved, error: null }) });
const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", GITHUB_TOKEN: "github_pat_x" };
const env = (over = {}) => (k) => ({ ...ENV, ...over })[k];
const post = (body, auth = "Bearer jwt") => new Request("https://f/vault-punch", { method: "POST", headers: auth ? { Authorization: auth } : {}, body: JSON.stringify(body) });
const handler = (gh, opts = {}) => makePunchHandler({ createClient: sbFake(opts.approved ?? true), fetchFn: gh.fetchFn, env: env(opts.env), punch, sleep: async () => {} });

test("sign-in and approval required", async () => {
  const gh = fakeGitHub();
  assert.equal((await handler(gh)(post({ action: "list" }, null))).status, 401);
  assert.equal((await handler(gh, { approved: false })(post({ action: "list" }))).status, 403);
  assert.equal(gh.st.log.length, 0, "GitHub never touched");
});

test("missing GitHub key gives a plain-English error", async () => {
  const r = await handler(fakeGitHub(), { env: { GITHUB_TOKEN: "" } })(post({ action: "list" }));
  assert.equal(r.status, 500);
  assert.match((await r.json()).error, /GITHUB_TOKEN/);
});

test("list creates the punch-list branch the first time", async () => {
  const gh = fakeGitHub({ items: null, branch: false });
  const r = await handler(gh)(post({ action: "list" }));
  assert.deepEqual(await r.json(), { items: [] });
  assert.ok(gh.st.log.includes("POST git/refs"));
});

test("add with screenshot, then note reopens, status, delete", async () => {
  const gh = fakeGitHub({ items: [{ id: "old", title: "Existing", status: "Open" }] });
  const h = handler(gh);
  const add = await (await h(post({ action: "add", fields: { title: "Café 🐞", type: "Bug", page: "Add", priority: "High", added_by: "Gigi" }, shot: "AAAA" }))).json();
  const id = add.item.id;
  assert.equal(gh.items().length, 2);
  assert.match(add.item.screenshots[0], new RegExp(`^screenshots/${id}-[0-9a-f]{6}\\.jpg$`));
  assert.equal(gh.st.files[add.item.screenshots[0]].content, "AAAA");
  assert.equal(gh.items()[1].title, "Café 🐞");

  await h(post({ action: "status", id, status: "Done" }));
  assert.equal(gh.items()[1].status, "Done");
  const ed = await (await h(post({ action: "edit", id, comment: { by: "John", text: "one more thing" } }))).json();
  assert.equal(ed.item.status, "Open");
  assert.equal(gh.items()[1].comments[0].text, "one more thing");

  const shot = await (await h(post({ action: "shot", path: add.item.screenshots[0] }))).json();
  assert.equal(shot.data, "AAAA");
  assert.equal((await h(post({ action: "shot", path: "../secrets" }))).status, 400);

  await h(post({ action: "delete", id }));
  assert.deepEqual(gh.items().map((i) => i.id), ["old"]);
});

test("someone else saving in between → retries and keeps both changes", async () => {
  const gh = fakeGitHub({ items: [], conflicts: 2 });
  const r = await handler(gh)(post({ action: "add", fields: { title: "x" } }));
  assert.equal(r.status, 200);
  assert.equal(gh.items().length, 1);
  assert.equal(gh.st.log.filter((l) => l === "PUT contents/punch_list.json").length, 3);
});

test("add needs a title; unknown action rejected", async () => {
  const h = handler(fakeGitHub());
  assert.equal((await h(post({ action: "add", fields: { title: " " } }))).status, 400);
  assert.equal((await h(post({ action: "toString" }))).status, 400);
});

test("index.ts is up to date and loads", async () => {
  const built = buildVaultPunch();
  assert.equal(readFileSync(new URL("./functions/vault-punch/index.ts", import.meta.url), "utf8"), built, "run: node supabase/build_functions.mjs");
  const dir = mkdtempSync(join(tmpdir(), "vp-"));
  const file = join(dir, "index.mjs");
  writeFileSync(file, built.replace(/^import .*$/m, "const createClient = () => ({});").replace(/^Deno\.serve.*$/m, "export { makePunchHandler, punch };"));
  const mod = await import(file);
  assert.equal(typeof mod.makePunchHandler, "function");
  assert.equal(typeof mod.punch.applyEdit, "function");
});
