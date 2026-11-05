// The AI rules — ported from the Python app (web/reference/ailogic.py). Used by the Supabase Edge Function (photo
// descriptions, outfits) and the app. Parity-tested against fixtures generated from the Python code
// (web/supabase/make_fixtures.py → ai.fixtures.json). Change both sides together.
// Plain JavaScript with no imports, so the Edge Function bundle can inline it.

export const CATEGORIES = ["top", "bottom", "dress", "jumpsuit", "outerwear", "sweater", "activewear",
  "swimwear", "shoes", "bag", "accessory", "jewelry", "sleepwear", "other"];
export const FORMALITY = ["very casual", "casual", "smart casual", "business", "dressy", "formal"];
export const SEASONS = ["spring", "summer", "fall", "winter"];
export const PLACEHOLDER_NAMES = new Set(["", "new item"]);
export const ITEM_FIELDS = ["name", "category", "subcategory", "primary_color", "colors", "pattern", "material", "fit",
  "formality", "seasons", "styles", "description", "brand", "size", "notes", "favorite", "times_worn"];

export function isUntagged(item) {
  return !(item.description || "").trim() || PLACEHOLDER_NAMES.has((item.name || "").trim().toLowerCase());
}

const clone = (x) => JSON.parse(JSON.stringify(x));
const truthy = (v) => !(v === undefined || v === null || v === false || v === 0 || v === "" ||
  (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0));

/** Python's json.dumps(x, ensure_ascii=False) — same separators and number style. */
export function pyJson(v) {
  if (v === null || v === undefined) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(pyJson).join(", ") + "]";
  return "{" + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ": " + pyJson(x)).join(", ") + "}";
}

/** Numbers as a person writes them (Python f"{v:g}"): 36, 36.5. */
export function num(v) {
  if (typeof v === "number" && Number.isFinite(v)) return String(Number(v.toPrecision(6)));
  return String(v);
}

export function strictify(schema) {
  if (Array.isArray(schema)) { schema.forEach(strictify); return schema; }
  if (schema && typeof schema === "object") {
    if (schema.type === "object" && "properties" in schema) {
      schema.additionalProperties = false;
      schema.required = Object.keys(schema.properties);
    }
    for (const v of Object.values(schema)) strictify(v);
  }
  return schema;
}

export function toolRequest(tool, content, maxTokens, model) {
  const t = clone(tool);
  strictify(t.input_schema);
  t.strict = true;
  const instruction = `\n\nAnswer only by calling the ${t.name} tool.`;
  content = typeof content === "string" ? content + instruction : [...content, { type: "text", text: instruction.trim() }];
  return { model, max_tokens: maxTokens, tools: [t], tool_choice: { type: "auto" }, messages: [{ role: "user", content }] };
}

export function toolAnswer(message, name) {
  for (const b of message.content || []) if (b.type === "tool_use" && b.name === name) return { ...(b.input || {}) };
  return null;
}

// ---------------------------------------------------------------- describing a photo
export const TAG_PROMPT = "This is a photo of one item from a woman's closet, taken on her phone. " +
  "Catalog the main garment or accessory in the photo. Ignore the background, " +
  "hangers and anything else in frame. Use everyday color names a shopper would use. " +
  "Use an empty string for anything you can't tell (e.g. brand).";

export function tagTool(styleNames) {
  return {
    name: "record_item",
    description: "Record the catalog details for the single main clothing item in the photo.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Short catalog name, e.g. 'Light-wash high-rise skinny jeans'" },
        category: { type: "string", enum: CATEGORIES },
        subcategory: { type: "string", description: "e.g. t-shirt, blouse, jeans, midi skirt, ankle boots" },
        primary_color: { type: "string", description: "Plain color name, e.g. 'navy', 'cream', 'olive'" },
        colors: { type: "array", items: { type: "string" }, description: "All notable colors" },
        pattern: { type: "string", description: "solid, striped, floral, plaid, animal print, etc." },
        material: { type: "string", description: "Best guess: denim, cotton, knit, linen, leather..." },
        fit: { type: "string", description: "e.g. fitted, relaxed, oversized, wide-leg, cropped" },
        formality: { type: "string", enum: FORMALITY },
        seasons: { type: "array", items: { type: "string", enum: SEASONS } },
        styles: {
          type: "array",
          items: styleNames && styleNames.length ? { type: "string", enum: styleNames } : { type: "string" },
          description: "Which styles this piece suits (1-4)",
        },
        description: { type: "string", description: "One or two sentences describing the piece and what it pairs well with" },
        brand: { type: "string", description: "Only if a label/logo is clearly visible, else empty" },
      },
      required: ["name", "category", "primary_color", "colors", "pattern", "formality", "seasons", "styles", "description"],
    },
  };
}

export function tagRequest(imageB64, styleNames, model, mediaType = "image/jpeg") {
  return toolRequest(tagTool(styleNames), [
    { type: "image", source: { type: "base64", media_type: mediaType, data: imageB64 } },
    { type: "text", text: TAG_PROMPT },
  ], 1024, model);
}

export function cleanTag(data) {
  const d = { ...data };
  if (!CATEGORIES.includes(d.category)) d.category = "other";
  return d;
}

/** The update to save after the AI describes an existing item (keeps what she typed herself). */
export function mergeDescribe(item, fields) {
  const row = Object.fromEntries(Object.entries(fields).filter(([k]) => ITEM_FIELDS.includes(k)));
  if (!PLACEHOLDER_NAMES.has((item.name || "").trim().toLowerCase())) delete row.name;
  for (const k of ["brand", "size"]) if ((item[k] || "").trim()) delete row[k];
  const own = (item.description || "").trim();
  const notes = (item.notes || "").trim();
  if (own && !PLACEHOLDER_NAMES.has(own.toLowerCase()) && !notes.includes(own)) row.notes = notes ? `${notes}\n${own}`.trim() : own;
  return row;
}

// ---------------------------------------------------------------- outfits
export const OUTFIT_TOOL = {
  name: "propose_outfits",
  description: "Propose complete outfits built only from the numbered closet items.",
  input_schema: {
    type: "object",
    properties: {
      outfits: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short, fun outfit name (2-5 words)" },
            items: { type: "array", items: { type: "integer" }, description: "Closet item numbers in this outfit, head to toe" },
            why: { type: "string", description: "1-2 sentences: why it suits the style and her figure/colouring" },
            tip: { type: "string", description: "One styling tip (tuck, roll, layer, accessorize)" },
            add_piece: { type: "string", description: "Optional: one piece she doesn't own that would elevate this look, " +
              "with color — e.g. 'tan suede ankle boots'. Empty if nothing needed." },
          },
          required: ["title", "items", "why", "tip"],
        },
      },
      closet_gaps: { type: "array", items: { type: "string" }, description: "Up to 3 pieces (with colors) that would unlock more outfits in this style" },
    },
    required: ["outfits"],
  },
};

export const CATALOG_KEYS = ["category", "subcategory", "name", "primary_color", "colors", "pattern", "material",
  "fit", "formality", "seasons", "styles", "notes"];

export function catalog(items) {
  return items.map((it, i) => {
    const bits = {};
    for (const k of CATALOG_KEYS) if (truthy(it[k])) bits[k] = it[k];
    if (it.favorite) bits.favorite = true;
    if (it.times_worn) bits.times_worn = it.times_worn;
    return `${i + 1}. ` + pyJson(bits);
  }).join("\n");
}

export function profileText(profile) {
  const m = profile.measurements || {};
  const out = [];
  if (truthy(m)) {
    const h = m.height;
    const parts = [h ? `height ${Math.floor(h / 12)}'${num(h % 12)}"` : null];
    for (const [k, v] of Object.entries(m)) if (k !== "height" && k !== "weight" && truthy(v)) parts.push(`${k.replaceAll("_", " ")} ${num(v)}"`);
    out.push("Measurements (inches): " + parts.filter(Boolean).join(", "));
  }
  if (truthy(profile.sizes)) out.push("Usual sizes: " + Object.entries(profile.sizes).map(([k, v]) => `${k} ${v}`).join(", "));
  if (profile.fit_notes) out.push("What she likes to show off / play down: " + profile.fit_notes);
  if (profile.color_notes) out.push("Colors she loves / avoids: " + profile.color_notes);
  if (truthy(profile.my_styles)) out.push("Her favorite styles: " + profile.my_styles.join(", "));
  return out.join("\n") || "(No profile details entered yet.)";
}

export function outfitPrompt(usable, profile, style, styleDesc = "", occasion = "", season = "", count = 4) {
  return `You are a warm, practical personal stylist helping a woman put together outfits from her own closet.

ABOUT HER
${profileText(profile)}

WHAT SHE WANTS
Style: ${style}${styleDesc ? ` — ${styleDesc}` : ""}
Occasion / plans: ${occasion || "everyday"}
Season / weather: ${season || "any"}

HER CLOSET (number. details)
${catalog(usable)}

Create ${count} different outfits using ONLY item numbers from her closet.
Rules:
- Each outfit is complete: either a dress/jumpsuit, or a top (or sweater) plus a bottom. Add shoes if she has suitable ones; add outerwear, a bag or accessories when they help.
- Fit the requested style, occasion and season. Respect her color likes/dislikes and what she wants to show off or play down; use her measurements to favor flattering proportions.
- Make the outfits genuinely different from each other. Favor favorites and pieces she hasn't worn much.
- If her closet can't make ${count} good outfits for this request, return fewer rather than forcing bad ones, and say what's missing in closet_gaps.`;
}

export function outfitRequest(usable, profile, style, styleDesc, occasion, season, count, model) {
  return toolRequest(OUTFIT_TOOL, outfitPrompt(usable, profile, style, styleDesc, occasion, season, count), 3000, model);
}

export function readOutfits(data, usable) {
  const outfits = [];
  for (const o of data.outfits || []) {
    const picked = [], seen = new Set();
    for (const n of o.items || []) {
      if (Number.isInteger(n) && n >= 1 && n <= usable.length && !seen.has(n)) { seen.add(n); picked.push(usable[n - 1]); }
    }
    if (picked.length) outfits.push({ title: o.title ?? "Outfit", items: picked, why: o.why ?? "", tip: o.tip ?? "", add_piece: o.add_piece ?? "" });
  }
  return { outfits, closet_gaps: (data.closet_gaps || []).filter(Boolean).slice(0, 3) };
}

// ---------------------------------------------------------------- try-on (Gemini image model; no Python reference)
export const TRYON_ORDER = ["outerwear", "dress", "jumpsuit", "top", "sweater", "bottom", "activewear", "swimwear",
  "sleepwear", "shoes", "bag", "accessory", "jewelry", "other"];

/** Pieces in head-to-toe-ish order so the prompt's numbering matches the images sent. */
export function tryonOrder(items) {
  const rank = (c) => { const n = TRYON_ORDER.indexOf(c); return n < 0 ? TRYON_ORDER.length : n; };
  return [...items].sort((a, b) => rank(a.category) - rank(b.category));
}

export function tryonPrompt(items) {
  const lines = items.map((it, n) => {
    const bits = [it.name, it.primary_color && `main color ${it.primary_color}`, it.pattern && it.pattern !== "solid" && it.pattern,
      it.material, it.fit].filter(Boolean);
    return `Image ${n + 2}: ${it.category || "item"} — ${bits.join(", ")}`;
  });
  return `Virtual try-on. Image 1 is a full-length photo of a woman. The other images are pieces of clothing from her own closet:
${lines.join("\n")}

Create one photorealistic, full-length photo of the SAME woman from image 1 wearing ALL of these pieces together as one outfit.
- Keep her exactly as she is: same face, hair, skin tone, body shape and proportions, same pose, same background and lighting.
- Reproduce each piece faithfully: same color, pattern, fabric, length and cut. Dress her the way a real person would wear them (layering, tucking, shoes on her feet, bag held or on her shoulder).
- Replace what she is wearing in image 1 with this outfit. Don't add clothing or accessories that aren't listed; where something isn't covered (e.g. no shoes listed), keep it simple and neutral.
- Natural fit and drape for her body; no text, no borders, no collage — a single photo.`;
}

/** Gemini generateContent body: prompt, then her photo, then each piece (same order as the prompt). */
export function tryonRequest(prompt, bodyImg, itemImgs, size = "1K") {
  const img = (x) => ({ inlineData: { mimeType: x.mime || "image/jpeg", data: x.b64 } });
  return {
    contents: [{ role: "user", parts: [{ text: prompt }, img(bodyImg), ...itemImgs.map(img)] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:4", imageSize: size } },
  };
}

/** {image, mime} from a Gemini response, or {blocked: reason} when it refused / returned no picture. */
export function readImage(res) {
  const fb = res?.promptFeedback?.blockReason;
  if (fb) return { blocked: fb };
  const cand = res?.candidates?.[0];
  for (const p of cand?.content?.parts || []) {
    const d = p.inlineData || p.inline_data;
    if (!p.thought && d?.data && String(d.mimeType || d.mime_type || "").startsWith("image/")) return { image: d.data, mime: d.mimeType || d.mime_type };
  }
  return { blocked: cand?.finishReason || "NO_IMAGE" };
}
