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
  out.push(...guideText(profile.guide));
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

// ---------------------------------------------------------------- shopping suggestions (no Python reference)
export const SHOP_PRIORITY = ["must-have", "nice to have", "fun extra"];
export const SHOP_TOOL = {
  name: "suggest_purchases",
  description: "Suggest new pieces and colors for her to buy, based on the numbered closet items she already owns.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "2-3 sentences: what her closet has plenty of, and what's missing" },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            piece: { type: "string", description: "Specific piece with color, e.g. 'Tan suede ankle boots with a block heel'" },
            category: { type: "string", enum: CATEGORIES },
            color: { type: "string", description: "Plain color name" },
            why: { type: "string", description: "1-2 sentences: why it suits her figure, colouring and style, and what gap it fills" },
            pairs_with: { type: "array", items: { type: "integer" }, description: "Closet item numbers it would be worn with (2-6)" },
            new_looks: { type: "integer", description: "Rough number of new outfits it would make possible" },
            priority: { type: "string", enum: SHOP_PRIORITY },
            search: { type: "string", description: "Short shopping search phrase, e.g. 'tan suede block heel ankle boots women'" },
          },
          required: ["piece", "category", "color", "why", "pairs_with", "new_looks", "priority", "search"],
        },
      },
      colors: {
        type: "array",
        items: {
          type: "object",
          properties: { color: { type: "string" }, why: { type: "string", description: "One sentence" } },
          required: ["color", "why"],
        },
        description: "2-4 colors she doesn't own much of that would flatter her and work with what she has",
      },
    },
    required: ["summary", "suggestions", "colors"],
  },
};

const BUDGET = { budget: "budget-friendly (think Target, Old Navy, H&M)", mid: "mid-range (think J.Crew, Madewell, Nordstrom brands)",
  splurge: "a few investment pieces worth spending on" };

export function shopPrompt(usable, profile, { style = "", styleDesc = "", occasion = "", season = "", budget = "", count = 6 } = {}) {
  return `You are a warm, practical personal stylist helping a woman decide what to buy next. The goal is pieces that work hard with what she ALREADY owns — not a new wardrobe.

ABOUT HER
${profileText(profile)}

WHAT SHE'S SHOPPING FOR
Style focus: ${style ? `${style}${styleDesc ? ` — ${styleDesc}` : ""}` : "her favorite styles overall"}
Occasion / plans: ${occasion || "everyday life"}
Season / weather: ${season || "the coming season"}
Budget: ${BUDGET[budget] || "any"}

HER CLOSET (number. details)
${catalog(usable)}

Suggest up to ${count} pieces to buy, best first.
Rules:
- Each suggestion must pair with several things she owns (list their numbers in pairs_with) and fill a real gap — a missing category, color, layer, shoe or bag — rather than duplicate what she has.
- Respect her color likes/dislikes and what she wants to show off or play down; use her measurements to choose flattering cuts and lengths.
- Be specific (color, cut, material, length) so she could find it in a store. No brand names unless the budget suggests one.
- Also suggest 2-4 colors she has little of that would flatter her and mix with her closet.`;
}

export function shopRequest(usable, profile, opts, model) {
  return toolRequest(SHOP_TOOL, shopPrompt(usable, profile, opts), 3000, model);
}

/** Model answer → suggestions with pairs_with mapped to real closet items (bad/repeated numbers dropped). */
export function readShop(data, usable) {
  const suggestions = (data.suggestions || []).filter((s) => s && String(s.piece || "").trim()).map((s) => {
    const seen = new Set(), pairs = [];
    for (const n of s.pairs_with || []) if (Number.isInteger(n) && n >= 1 && n <= usable.length && !seen.has(n)) { seen.add(n); pairs.push(usable[n - 1]); }
    return {
      piece: String(s.piece).trim(), category: CATEGORIES.includes(s.category) ? s.category : "other", color: s.color || "",
      why: s.why || "", pairs_with: pairs, new_looks: Number.isInteger(s.new_looks) && s.new_looks > 0 ? s.new_looks : 0,
      priority: SHOP_PRIORITY.includes(s.priority) ? s.priority : "nice to have", search: String(s.search || s.piece).trim(),
    };
  });
  const colors = (data.colors || []).filter((c) => c && c.color).slice(0, 4).map((c) => ({ color: c.color, why: c.why || "" }));
  return { summary: data.summary || "", suggestions, colors };
}

/** Which of her usual sizes applies to a category ("" if none). */
export function sizeFor(category, sizes = {}) {
  const key = { top: "tops", sweater: "tops", outerwear: "tops", activewear: "tops", bottom: "bottoms", dress: "dresses",
    jumpsuit: "dresses", swimwear: "tops", sleepwear: "tops", shoes: "shoes" }[category];
  return (key && sizes[key]) || "";
}

/** A Google Shopping search for the piece, in her size when we know it. */
export function shopLink(search, category, sizes, wear = "womens") {
  const size = sizeFor(category, sizes);
  const who = wear === "mens" ? "men" : "women";
  const q = [search, new RegExp(`\\b${who}'?s?\\b`, "i").test(search) ? "" : who, size && `size ${size}`].filter(Boolean).join(" ");
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`;
}

// ---------------------------------------------------------------- her style guide: colors + shape (no Python reference)
export const SHAPES = ["hourglass", "pear", "inverted triangle", "rectangle", "apple"];

/** A rough shape from bust / waist / hips (inches) using the usual stylist rules; "" if any is missing. */
export function bodyShape(m = {}) {
  const bust = Number(m.bust), waist = Number(m.waist), hips = Number(m.hips);
  if (!(bust > 0 && waist > 0 && hips > 0)) return "";
  const big = Math.max(bust, hips);
  if (waist >= 0.9 * big) return "apple";
  if (hips - bust >= 0.05 * hips) return "pear";
  if (bust - hips >= 0.05 * bust) return "inverted triangle";
  return waist <= 0.75 * big ? "hourglass" : "rectangle";
}

/** Lines the outfit / shopping prompts get once she has a guide (nothing before, so older prompts are unchanged). */
export function guideText(guide) {
  const g = guide || {}, c = g.colors || {}, s = g.shape || {}, out = [];
  if (truthy(c.best)) {
    const type = [c.season, c.undertone && `${c.undertone} undertone`].filter(Boolean).join(", ");
    let line = `Her best colors${type ? ` (${type})` : ""}: ${c.best.map((x) => x.name).join(", ")}`;
    if (truthy(c.neutrals)) line += `; best neutrals: ${c.neutrals.map((x) => x.name).join(", ")}`;
    if (truthy(c.avoid)) line += `; keep away from her face: ${c.avoid.map((x) => x.name).join(", ")}`;
    out.push(line);
  }
  if (s.shape) {
    const picks = (s.best || []).flatMap((b) => b.picks || []).slice(0, 8);
    out.push(`Body shape: ${s.shape}${picks.length ? ` — flattering: ${picks.join("; ")}` : ""}`);
  }
  return out;
}

export const UNDERTONES = ["warm", "cool", "neutral", "olive"];
export const CONTRASTS = ["low", "medium", "high"];
export const GUIDE_AREAS = ["Necklines", "Tops", "Bottoms", "Dresses", "Jackets & layers", "Lengths & proportions"];
const swatch = (extra = {}) => ({
  type: "object",
  properties: { name: { type: "string", description: "Everyday color name a shopper would use" },
    hex: { type: "string", description: "Hex code, e.g. #7A2E3B" }, ...extra },
  required: ["name", "hex", ...Object.keys(extra)],
});

export const GUIDE_TOOL = {
  name: "record_style_guide",
  description: "Record her personal color analysis and body-shape style guide.",
  input_schema: {
    type: "object",
    properties: {
      colors: {
        type: "object",
        properties: {
          season: { type: "string", description: "Seasonal color type, e.g. 'Soft Autumn', 'Bright Winter', 'Light Summer'" },
          undertone: { type: "string", enum: UNDERTONES },
          contrast: { type: "string", enum: CONTRASTS, description: "Contrast between her skin, hair and eyes" },
          summary: { type: "string", description: "2-3 warm, plain-English sentences: her coloring and why these colors work on her" },
          best: { type: "array", items: swatch({ wear: { type: "string", description: "Short: how to wear it, e.g. 'tops and scarves near the face'" } }),
            description: "8-12 colors that flatter her most" },
          neutrals: { type: "array", items: swatch(), description: "3-5 neutrals to build outfits around" },
          metals: { type: "string", description: "Which jewelry metals suit her best, one short sentence" },
          avoid: { type: "array", items: swatch({ why: { type: "string", description: "One short reason" } }),
            description: "2-4 colors that wash her out or fight her coloring" },
          tip: { type: "string", description: "How to still wear a color she loves that isn't in her palette" },
        },
        required: ["season", "undertone", "contrast", "summary", "best", "neutrals", "metals", "avoid", "tip"],
      },
      shape: {
        type: "object",
        properties: {
          shape: { type: "string", description: "Her body shape, e.g. 'Hourglass', 'Pear (triangle)', 'Rectangle'" },
          summary: { type: "string", description: "2-3 positive sentences: her proportions and the overall styling goal" },
          best: {
            type: "array",
            items: { type: "object", properties: { area: { type: "string", enum: GUIDE_AREAS },
              picks: { type: "array", items: { type: "string" }, description: "2-4 specific cuts, e.g. 'wrap tops', 'high-rise straight jeans'" } },
            required: ["area", "picks"] },
            description: "What flatters her, by area",
          },
          avoid: { type: "array", items: { type: "string" }, description: "2-4 cuts that work against her proportions, phrased kindly" },
        },
        required: ["shape", "summary", "best", "avoid"],
      },
      styles: {
        type: "array",
        items: { type: "object", properties: {
          name: { type: "string", description: "Exact name from her style list when one fits, otherwise a short new style name" },
          description: { type: "string", description: "What the style is, a few words" },
          why: { type: "string", description: "One sentence: why it suits her shape, coloring and taste" } },
        required: ["name", "description", "why"] },
        description: "3-5 styles that suit both her body and her taste, best first",
      },
      confidence: { type: "string", description: "One sentence: how sure the color read is and what would make it better" },
    },
    required: ["colors", "shape", "styles", "confidence"],
  },
};

function coloringText(c = {}) {
  const bits = [["hair", c.hair], ["eyes", c.eyes], ["skin", c.skin], ["jewelry that looks best on her", c.metal],
    ["the veins on her wrist look", c.veins]].filter(([, v]) => v && String(v).trim() && v !== "Not sure");
  return bits.length ? bits.map(([k, v]) => `${k}: ${String(v).trim()}`).join("; ") : "(not given)";
}

/** photos: [{label}] in the order the images are sent. */
export function guidePrompt(profile, styles, photos) {
  const shape = bodyShape(profile.measurements || {});
  const imgs = photos.length ? photos.map((p, n) => `Image ${n + 1}: her ${p.label === "Face" ? "face close-up" : `${p.label.toLowerCase()} body photo`}`).join("\n")
    : "(No photos — judge from her description only, and say so in confidence.)";
  return `You are a warm, expert personal stylist and color analyst. Make a personal style guide for this woman: the colors that flatter her skin tone, the cuts that flatter her body shape, and the styles that suit her.

ABOUT HER
${profileText({ ...profile, guide: null })}
Shape from her measurements (standard bust/waist/hip rules): ${shape || "not enough measurements"}
Her coloring, in her own words: ${coloringText(profile.coloring)}

PHOTOS
${imgs}

HER STYLE LIST (use these exact names when one fits)
${styles.map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ""}`).join("\n") || "(none)"}

How to do it:
- Colors: judge her undertone, contrast and seasonal color type from her skin, hair and eyes. Phone photos shift color (warm indoor light, filters), so weigh her own description and the jewelry / vein hints heavily when the light looks off. Give real hex codes. Keep her own color likes in mind, but be honest about what flatters.
- Shape: use her measurements first and the photos only to confirm proportions. Be specific by area. Positive tone — what to highlight and balance, never flaws, never weight loss. Respect what she says she likes to show off or play down.
- Styles: 3-5 that suit both her shape and the styles she already likes.`;
}

export function guideRequest(profile, styles, photos, model) {
  const content = [...photos.map((p) => ({ type: "image", source: { type: "base64", media_type: p.mime || "image/jpeg", data: p.b64 } })),
    { type: "text", text: guidePrompt(profile, styles, photos) }];
  return toolRequest(GUIDE_TOOL, content, 4000, model);
}

const hexOk = (h) => (/^#[0-9a-f]{6}$/i.test(String(h || "").trim()) ? String(h).trim().toUpperCase() : "");
const swatches = (list, keys = []) => (list || []).filter((x) => x && String(x.name || "").trim())
  .map((x) => ({ name: String(x.name).trim(), hex: hexOk(x.hex), ...Object.fromEntries(keys.map((k) => [k, String(x[k] || "")])) }));

/** Model answer → the guide saved on her profile (bad hex codes blanked, empty entries dropped). */
export function readGuide(data, now = new Date().toISOString()) {
  const c = data.colors || {}, s = data.shape || {};
  return {
    made_at: now,
    colors: { season: c.season || "", undertone: UNDERTONES.includes(c.undertone) ? c.undertone : "",
      contrast: CONTRASTS.includes(c.contrast) ? c.contrast : "", summary: c.summary || "",
      best: swatches(c.best, ["wear"]).slice(0, 12), neutrals: swatches(c.neutrals).slice(0, 5), metals: c.metals || "",
      avoid: swatches(c.avoid, ["why"]).slice(0, 4), tip: c.tip || "" },
    shape: { shape: s.shape || "", summary: s.summary || "",
      best: (s.best || []).filter((b) => b && (b.picks || []).length).map((b) => ({ area: GUIDE_AREAS.includes(b.area) ? b.area : "Tops", picks: b.picks.filter(Boolean) })),
      avoid: (s.avoid || []).filter(Boolean) },
    styles: (data.styles || []).filter((x) => x && String(x.name || "").trim()).slice(0, 5)
      .map((x) => ({ name: String(x.name).trim(), description: x.description || "", why: x.why || "" })),
    confidence: data.confidence || "",
  };
}

// ---------------------------------------------------------------- build an outfit around her pieces / idea (no Python reference)
export const COMPLETE_TOOL = {
  name: "complete_outfit",
  description: "Finish her outfit idea using the numbered closet items, with finishing touches.",
  input_schema: {
    type: "object",
    properties: {
      looks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short, fun outfit name (2-5 words)" },
            items: { type: "array", items: { type: "integer" }, description: "Closet item numbers in the finished look, head to toe — include every piece she started with" },
            why: { type: "string", description: "1-2 sentences: why it works for her idea and her figure/colouring" },
            tip: { type: "string", description: "One styling tip (tuck, roll, layer)" },
            accessories: {
              type: "array",
              items: { type: "object", properties: {
                idea: { type: "string", description: "Finishing touch with color, e.g. 'gold hoops', 'tan woven belt'" },
                item: { type: "integer", description: "Closet item number if it's one of her pieces, otherwise 0" } },
              required: ["idea", "item"] },
              description: "2-4 finishing touches: jewelry, belt, bag, scarf, hat, hair",
            },
            add_piece: { type: "string", description: "Optional: one piece she doesn't own that would elevate this look, with color. Empty if nothing needed." },
          },
          required: ["title", "items", "why", "tip", "accessories", "add_piece"],
        },
      },
      shopping: {
        type: "array",
        items: { type: "object", properties: {
          piece: { type: "string", description: "Specific piece with color" },
          category: { type: "string", enum: CATEGORIES },
          why: { type: "string", description: "One sentence" },
          search: { type: "string", description: "Short shopping search phrase" } },
        required: ["piece", "category", "why", "search"] },
        description: "Up to 3 accessories or pieces she doesn't own that would complete these looks",
      },
    },
    required: ["looks", "shopping"],
  },
};

export function completePrompt(usable, profile, starts, { idea = "", style = "", styleDesc = "", occasion = "", season = "", count = 2 } = {}) {
  const startText = starts.length ? starts.map((it) => `${usable.indexOf(it) + 1}. ${it.name}`).join("\n") : "(none picked — build from her idea)";
  return `You are a warm, practical personal stylist. She has started putting an outfit together and wants help finishing it and accessorizing it.

ABOUT HER
${profileText(profile)}

HER IDEA
Pieces she wants to wear:
${startText}
In her words: ${idea || "(nothing written)"}
Style: ${style ? `${style}${styleDesc ? ` — ${styleDesc}` : ""}` : "whatever suits her idea"}
Occasion / plans: ${occasion || "everyday"}
Season / weather: ${season || "any"}

HER CLOSET (number. details)
${catalog(usable)}

Make ${count} different finished look${count === 1 ? "" : "s"} built around her idea.
Rules:
- Every look includes ALL the pieces she wants to wear. Fill in what's missing from her own closet first: a top or bottom if needed, shoes, a layer, a bag.
- Then finishing touches in accessories: jewelry, belt, bag, scarf, hat, hair. Use her own pieces (give the number) when she has something suitable; otherwise describe a simple one with its color and use 0.
- Fit her idea, the occasion and the weather. Respect her colors and what she likes to show off or play down.
- When there is more than one look, make them genuinely different (e.g. one relaxed, one dressed up).
- In shopping, up to 3 things she doesn't own that would make these looks — and her chosen pieces — work harder. Empty if nothing is needed.`;
}

export function completeRequest(usable, profile, starts, opts, model) {
  return toolRequest(COMPLETE_TOOL, completePrompt(usable, profile, starts, opts), 3000, model);
}

/** Model answer → looks with real items; her starting pieces are always kept in. */
export function readComplete(data, usable, starts = []) {
  const at = (n) => (Number.isInteger(n) && n >= 1 && n <= usable.length ? usable[n - 1] : null);
  const looks = [];
  for (const o of data.looks || []) {
    const picked = [];
    for (const n of o.items || []) { const it = at(n); if (it && !picked.includes(it)) picked.push(it); }
    for (const s of starts) if (!picked.includes(s)) picked.unshift(s);
    if (!picked.length) continue;
    const accessories = (o.accessories || []).filter((a) => a && String(a.idea || "").trim()).slice(0, 4).map((a) => {
      const it = at(a.item);
      return { idea: String(a.idea).trim(), item: it && !picked.includes(it) ? it : null };
    });
    looks.push({ title: o.title || "Outfit", items: picked, why: o.why || "", tip: o.tip || "", accessories, add_piece: o.add_piece || "" });
  }
  const shopping = (data.shopping || []).filter((x) => x && String(x.piece || "").trim()).slice(0, 3).map((x) => ({
    piece: String(x.piece).trim(), category: CATEGORIES.includes(x.category) ? x.category : "accessory", why: x.why || "",
    search: String(x.search || x.piece).trim() }));
  return { looks, shopping };
}

// ---------------------------------------------------------------- menswear (profile.wear = "mens")
// The prompts are written for a woman (and parity-tested that way). For a man's closet they are rewritten
// word by word; "womens" (the default) leaves every prompt byte-for-byte unchanged.
// "her" as an object ("suit her.", "wash her out", "flatter her most") → him; otherwise possessive → his.
const HIM = /\bher\b(?=[.,;:!?)]|\s*$|\s+(?:and|or|most|best|exactly|to|out|the|well|more|up|off)\b)/gm;
export function forWear(text, wear) {
  if (wear !== "mens") return text;
  return text
    .replace(HIM, "him")
    .replace(/\bherself\b/g, "himself").replace(/\bHerself\b/g, "Himself")
    .replace(/\bher\b/g, "his").replace(/\bHer\b/g, "His")
    .replace(/\bSHE\b/g, "HE").replace(/\bHER$/gm, "HIM").replace(/\bHER\b/g, "HIS").replace(/\bbust\b/g, "chest")
    .replace(/\bshe's\b/g, "he's").replace(/\bShe's\b/g, "He's")
    .replace(/\bshe\b/g, "he").replace(/\bShe\b/g, "He")
    .replace(/\bwoman's\b/g, "man's").replace(/\bwoman\b/g, "man").replace(/\bWoman\b/g, "Man")
    .replace(/\bwomen\b/g, "men").replace(/\bWomen\b/g, "Men");
}
const wearOf = (p) => (p && p.wear === "mens" ? "mens" : "womens");

/** Rewrites the text parts of a Claude request for a man's closet (no-op for "womens"). */
export function wearRequest(req, profile) {
  const wear = wearOf(profile);
  if (wear === "womens") return req;
  const r = JSON.parse(JSON.stringify(req));
  for (const m of r.messages) {
    if (typeof m.content === "string") m.content = forWear(m.content, wear) + "\nHe is a man: suggest menswear only.";
    else { for (const c of m.content) if (c.type === "text") c.text = forWear(c.text, wear); m.content.push({ type: "text", text: "He is a man: suggest menswear only." }); }
  }
  for (const t of r.tools || []) t.description = forWear(t.description, wear);
  return r;
}
