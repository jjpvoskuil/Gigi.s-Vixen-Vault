import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalog, cleanTag, isUntagged, mergeDescribe, outfitRequest, profileText, readOutfits, tagRequest, toolAnswer } from "./ai.js";

const fx = JSON.parse(readFileSync(new URL("./ai.fixtures.json", import.meta.url)));
const usable = fx.items.filter((i) => !isUntagged(i));

test("untagged", () => assert.deepEqual(fx.items.filter(isUntagged).map((i) => i.id), fx.untagged));
test("closet catalog text", () => assert.equal(catalog(usable), fx.catalog));
fx.profiles.forEach((p, n) => test(`profile text ${n}`, () => assert.equal(profileText(p.profile), p.text)));
fx.tag_requests.forEach((t, n) => test(`photo request ${n}`, () => assert.deepEqual(tagRequest("IMGDATA", t.styles, "model-x"), t.request)));
fx.outfit_requests.forEach((o, n) => test(`outfit request ${n}`, () => {
  const [style, desc, occ, season, count, p] = o.args;
  const profile = [{}, fx.profiles[1].profile][p];
  assert.deepEqual(outfitRequest(usable, profile, style, desc, occ, season, count, "model-x"), o.request);
}));
fx.merge.forEach((m, n) => test(`keep her own text ${n}`, () => assert.deepEqual(mergeDescribe(m.item, m.fields), m.row)));
fx.read_outfits.forEach((r, n) => test(`read outfits ${n}`, () => {
  const res = readOutfits(r.data, usable);
  assert.deepEqual({ ...res, outfits: res.outfits.map((o) => ({ ...o, items: o.items.map((i) => i.id) })) }, r.result);
}));
fx.tool_answer.forEach((t, n) => test(`tool answer ${n}`, () => assert.deepEqual(toolAnswer(t.message, t.name), t.result)));
fx.clean_tag.forEach((c, n) => test(`clean tag ${n}`, () => assert.deepEqual(cleanTag(c.in), c.out)));
