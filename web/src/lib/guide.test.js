import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyShape, guidePrompt, guideText, profileText, readComplete, readGuide } from "./ai.js";

test("body shape from measurements", () => {
  assert.equal(bodyShape({ bust: 36, waist: 26, hips: 37 }), "hourglass");
  assert.equal(bodyShape({ bust: 34, waist: 28, hips: 40 }), "pear");
  assert.equal(bodyShape({ bust: 40, waist: 31, hips: 36 }), "inverted triangle");
  assert.equal(bodyShape({ bust: 35, waist: 30, hips: 36 }), "rectangle");
  assert.equal(bodyShape({ bust: 40, waist: 38, hips: 40 }), "apple");
  assert.equal(bodyShape({ bust: 36, hips: 38 }), "");
});

const raw = {
  colors: { season: "Soft Autumn", undertone: "warm", contrast: "medium", summary: "s",
    best: [{ name: "Olive", hex: "#6b7344", wear: "tops" }, { name: "Rust", hex: "rust", wear: "" }, { name: "", hex: "#000000", wear: "" }],
    neutrals: [{ name: "Camel", hex: "#B8875B" }], metals: "gold", avoid: [{ name: "Icy pink", hex: "#F4D7E6", why: "pale" }], tip: "t" },
  shape: { shape: "Pear", summary: "s", best: [{ area: "Bottoms", picks: ["A-line skirts"] }, { area: "Tops", picks: [] }], avoid: ["x"] },
  styles: [{ name: "Boho", description: "", why: "w" }], confidence: "c",
};

test("read guide: cleans hex codes and empty entries", () => {
  const g = readGuide(raw, "T");
  assert.equal(g.made_at, "T");
  assert.deepEqual(g.colors.best, [{ name: "Olive", hex: "#6B7344", wear: "tops" }, { name: "Rust", hex: "", wear: "" }]);
  assert.deepEqual(g.shape.best, [{ area: "Bottoms", picks: ["A-line skirts"] }]);
  assert.equal(g.styles[0].name, "Boho");
});

test("guide lines reach the outfit prompts only once there is a guide", () => {
  assert.deepEqual(guideText(undefined), []);
  const g = readGuide(raw);
  assert.deepEqual(guideText(g), [
    "Her best colors (Soft Autumn, warm undertone): Olive, Rust; best neutrals: Camel; keep away from her face: Icy pink",
    "Body shape: Pear — flattering: A-line skirts"]);
  assert.match(profileText({ guide: g }), /Body shape: Pear/);
  assert.doesNotMatch(guidePrompt({ guide: g, measurements: { bust: 34, waist: 28, hips: 40 } }, [], []), /Her best colors/);
  assert.match(guidePrompt({ measurements: { bust: 34, waist: 28, hips: 40 }, coloring: { hair: "auburn", metal: "Not sure" } }, [], [{ label: "Face" }]),
    /measurements.*: pear[\s\S]*hair: auburn\n[\s\S]*Image 1: her face close-up/);
});

test("read complete: keeps her pieces, maps accessories", () => {
  const usable = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const res = readComplete({ looks: [{ title: "T", items: [2, 2, 9], why: "", tip: "", add_piece: "",
    accessories: [{ idea: "gold hoops", item: 4 }, { idea: "belt", item: 0 }, { idea: "same", item: 2 }] }],
    shopping: [{ piece: "Necklace", category: "nope", why: "", search: "" }] }, usable, [usable[0]]);
  assert.deepEqual(res.looks[0].items.map((i) => i.id), ["a", "b"]);
  assert.deepEqual(res.looks[0].accessories.map((a) => [a.idea, a.item?.id || null]), [["gold hoops", "d"], ["belt", null], ["same", null]]);
  assert.deepEqual(res.shopping, [{ piece: "Necklace", category: "accessory", why: "", search: "Necklace" }]);
});

test("read guide: nested parts written as JSON text are read back", async () => {
  const { guideComplete } = await import("./ai.js");
  const g = readGuide({ ...raw, colors: JSON.stringify(raw.colors), shape: { ...raw.shape, best: JSON.stringify(raw.shape.best) }, styles: "[]" });
  assert.equal(g.colors.season, "Soft Autumn");
  assert.equal(g.colors.best.length, 2);
  assert.deepEqual(g.shape.best, [{ area: "Bottoms", picks: ["A-line skirts"] }]);
  assert.equal(guideComplete(g), true);
  assert.equal(guideComplete(readGuide({ colors: { best: [] }, shape: {}, styles: [], confidence: "" })), false);
});
