import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterSort, isUntagged, categoryCounts } from "./closet.js";

const fx = JSON.parse(readFileSync(new URL("./closet.fixtures.json", import.meta.url)));

test("untagged items match the Python app", () => {
  assert.deepEqual(fx.items.filter(isUntagged).map((i) => i.id), fx.untagged);
});

for (const c of fx.cases) {
  test(`filter/sort ${JSON.stringify(c.args)}`, () => {
    assert.deepEqual(filterSort(fx.items, c.args).map((i) => i.id), c.ids);
  });
}

test("category tabs follow catalog order with counts", () => {
  assert.deepEqual(categoryCounts(fx.items), [
    { id: "top", count: 2 }, { id: "bottom", count: 1 }, { id: "dress", count: 1 }, { id: "sweater", count: 1 },
    { id: "shoes", count: 1 }, { id: "other", count: 2 }]);
});
