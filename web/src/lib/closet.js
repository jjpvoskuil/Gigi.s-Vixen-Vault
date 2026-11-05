// Closet rules — ported from the Python app (web/reference/closetlogic.py, ailogic.py). Parity-tested against
// fixtures generated from the Python code (supabase/make_fixtures.py → closet.fixtures.json).

export const CATEGORIES = ["top", "bottom", "dress", "jumpsuit", "outerwear", "sweater", "activewear",
  "swimwear", "shoes", "bag", "accessory", "jewelry", "sleepwear", "other"];
export const FORMALITY = ["very casual", "casual", "smart casual", "business", "dressy", "formal"];
export const SEASONS = ["spring", "summer", "fall", "winter"];
export const SORTS = ["Newest", "Category", "Color", "Most worn", "Least worn"];
export const PLACEHOLDER_NAMES = new Set(["", "new item"]);

const SEARCH_FIELDS = ["name", "category", "subcategory", "primary_color", "pattern", "material",
  "fit", "description", "brand", "notes"];

const pyLower = (s) => s.toLowerCase();
const words = (s) => s.split(/\s+/).filter(Boolean);
const overlaps = (a, b) => a.some((x) => b.includes(x));

/** Saved without a proper description: blank description, or still named "New item". */
export function isUntagged(item) {
  return !(item.description || "").trim() || PLACEHOLDER_NAMES.has(pyLower((item.name || "").trim()));
}

export function matches(item, { q = "", cats = null, styles = null, seasons = null, fav = false } = {}) {
  if (cats?.length && !cats.includes(item.category || "other")) return false;
  if (fav && !item.favorite) return false;
  if (styles?.length && !overlaps(styles, item.styles || [])) return false;
  if (seasons?.length && !overlaps(seasons, item.seasons || [])) return false;
  if (q) {
    let hay = SEARCH_FIELDS.map((k) => String(item[k] || "")).join(" ");
    hay += " " + [...(item.colors || []), ...(item.styles || [])].join(" ");
    hay = pyLower(hay);
    return words(pyLower(q)).every((w) => hay.includes(w));
  }
  return true;
}

// Python compares strings by code point; so do these (not localeCompare)
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byKeys = (f) => (a, b) => { const x = f(a), y = f(b); for (let i = 0; i < x.length; i++) { const c = typeof x[i] === "number" ? x[i] - y[i] : cmp(x[i], y[i]); if (c) return c; } return 0; };

/** Items arrive newest first; other sorts are stable on top of that. */
export function sortItems(items, sort = "Newest") {
  const out = [...items];
  if (sort === "Category") out.sort(byKeys((i) => [i.category || "", i.subcategory || ""]));
  else if (sort === "Color") out.sort(byKeys((i) => [pyLower(i.primary_color || "")]));
  else if (sort === "Most worn") out.sort(byKeys((i) => [-(i.times_worn || 0)]));
  else if (sort === "Least worn") out.sort(byKeys((i) => [i.times_worn || 0]));
  return out;
}

export function filterSort(items, f = {}) {
  return sortItems(items.filter((i) => matches(i, f)), f.sort || "Newest");
}

/** Category tabs for the closet header: only categories she owns, in catalog order, with counts. */
export function categoryCounts(items) {
  const n = {};
  for (const i of items) n[i.category || "other"] = (n[i.category || "other"] || 0) + 1;
  return CATEGORIES.filter((c) => n[c]).map((c) => ({ id: c, count: n[c] }));
}

export const CATEGORY_LABEL = { top: "Tops", bottom: "Bottoms", dress: "Dresses", jumpsuit: "Jumpsuits",
  outerwear: "Outerwear", sweater: "Sweaters", activewear: "Active", swimwear: "Swim", shoes: "Shoes", bag: "Bags",
  accessory: "Accessories", jewelry: "Jewelry", sleepwear: "Sleep", other: "Other" };
