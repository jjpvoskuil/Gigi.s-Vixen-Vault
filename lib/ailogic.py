"""The AI rules, without Streamlit or the Anthropic SDK: tool schemas, prompts, request building and how answers
are read back. This is the reference the web app (web/src/lib/ai.js, run in a Supabase Edge Function) is
parity-tested against — change both together and rerun web/supabase/make_fixtures.py."""
import copy
import json

CATEGORIES = [
    "top", "bottom", "dress", "jumpsuit", "outerwear", "sweater", "activewear",
    "swimwear", "shoes", "bag", "accessory", "jewelry", "sleepwear", "other",
]
FORMALITY = ["very casual", "casual", "smart casual", "business", "dressy", "formal"]
SEASONS = ["spring", "summer", "fall", "winter"]
PLACEHOLDER_NAMES = {"", "new item"}


def is_untagged(item: dict) -> bool:
    """Items saved without a proper description: blank description, or still named 'New item'
    (what the app saves when the AI step fails)."""
    return (not (item.get("description") or "").strip()
            or (item.get("name") or "").strip().lower() in PLACEHOLDER_NAMES)


def strictify(schema):
    """Strict tools need additionalProperties:false and every property listed as required."""
    if isinstance(schema, dict):
        if schema.get("type") == "object" and "properties" in schema:
            schema["additionalProperties"] = False
            schema["required"] = list(schema["properties"].keys())
        for v in list(schema.values()):
            strictify(v)
    elif isinstance(schema, list):
        for v in schema:
            strictify(v)
    return schema


def tool_request(tool, content, max_tokens, model):
    """The Messages API request that asks the model to answer by calling `tool`.
    Newer models reject forced tool_choice, so: auto + strict, and the prompt says to use the tool."""
    t = copy.deepcopy(tool)
    strictify(t["input_schema"])
    t["strict"] = True
    instruction = f"\n\nAnswer only by calling the {t['name']} tool."
    if isinstance(content, str):
        content = content + instruction
    else:
        content = list(content) + [{"type": "text", "text": instruction.strip()}]
    return {"model": model, "max_tokens": max_tokens, "tools": [t], "tool_choice": {"type": "auto"},
            "messages": [{"role": "user", "content": content}]}


def tool_answer(message: dict, name: str):
    """The tool input from a Messages API response (as a dict), or None if the model answered in prose."""
    for block in message.get("content") or []:
        if block.get("type") == "tool_use" and block.get("name") == name:
            return dict(block.get("input") or {})
    return None


# ---------------------------------------------------------------- describing a photo
TAG_PROMPT = ("This is a photo of one item from a woman's closet, taken on her phone. "
              "Catalog the main garment or accessory in the photo. Ignore the background, "
              "hangers and anything else in frame. Use everyday color names a shopper would use. "
              "Use an empty string for anything you can't tell (e.g. brand).")


def tag_tool(style_names):
    return {
        "name": "record_item",
        "description": "Record the catalog details for the single main clothing item in the photo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Short catalog name, e.g. 'Light-wash high-rise skinny jeans'"},
                "category": {"type": "string", "enum": CATEGORIES},
                "subcategory": {"type": "string", "description": "e.g. t-shirt, blouse, jeans, midi skirt, ankle boots"},
                "primary_color": {"type": "string", "description": "Plain color name, e.g. 'navy', 'cream', 'olive'"},
                "colors": {"type": "array", "items": {"type": "string"}, "description": "All notable colors"},
                "pattern": {"type": "string", "description": "solid, striped, floral, plaid, animal print, etc."},
                "material": {"type": "string", "description": "Best guess: denim, cotton, knit, linen, leather..."},
                "fit": {"type": "string", "description": "e.g. fitted, relaxed, oversized, wide-leg, cropped"},
                "formality": {"type": "string", "enum": FORMALITY},
                "seasons": {"type": "array", "items": {"type": "string", "enum": SEASONS}},
                "styles": {
                    "type": "array",
                    "items": {"type": "string", "enum": style_names} if style_names else {"type": "string"},
                    "description": "Which styles this piece suits (1-4)",
                },
                "description": {"type": "string", "description": "One or two sentences describing the piece and what it pairs well with"},
                "brand": {"type": "string", "description": "Only if a label/logo is clearly visible, else empty"},
            },
            "required": ["name", "category", "primary_color", "colors", "pattern", "formality", "seasons", "styles", "description"],
        },
    }


def tag_request(image_b64, style_names, model):
    return tool_request(tag_tool(style_names), [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image_b64}},
        {"type": "text", "text": TAG_PROMPT},
    ], 1024, model)


def clean_tag(data):
    data = dict(data)
    if data.get("category") not in CATEGORIES:
        data["category"] = "other"
    return data


ITEM_FIELDS = ["name", "category", "subcategory", "primary_color", "colors", "pattern", "material", "fit",
               "formality", "seasons", "styles", "description", "brand", "size", "notes", "favorite", "times_worn"]


def merge_describe(item, fields):
    """The update to save after the AI describes an existing item. Keeps what she filled in by hand:
    a real name, brand and size; her own description moves into her notes instead of being lost."""
    row = {k: v for k, v in fields.items() if k in ITEM_FIELDS}
    if (item.get("name") or "").strip().lower() not in PLACEHOLDER_NAMES:
        row.pop("name", None)
    for k in ("brand", "size"):
        if (item.get(k) or "").strip():
            row.pop(k, None)
    own = (item.get("description") or "").strip()
    notes = (item.get("notes") or "").strip()
    if own and own.lower() not in PLACEHOLDER_NAMES and own not in notes:
        row["notes"] = f"{notes}\n{own}".strip() if notes else own
    return row


# ---------------------------------------------------------------- outfits
OUTFIT_TOOL = {
    "name": "propose_outfits",
    "description": "Propose complete outfits built only from the numbered closet items.",
    "input_schema": {
        "type": "object",
        "properties": {
            "outfits": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Short, fun outfit name (2-5 words)"},
                        "items": {"type": "array", "items": {"type": "integer"},
                                  "description": "Closet item numbers in this outfit, head to toe"},
                        "why": {"type": "string",
                                "description": "1-2 sentences: why it suits the style and her figure/colouring"},
                        "tip": {"type": "string", "description": "One styling tip (tuck, roll, layer, accessorize)"},
                        "add_piece": {"type": "string",
                                      "description": "Optional: one piece she doesn't own that would elevate this look, "
                                                     "with color — e.g. 'tan suede ankle boots'. Empty if nothing needed."},
                    },
                    "required": ["title", "items", "why", "tip"],
                },
            },
            "closet_gaps": {"type": "array", "items": {"type": "string"},
                            "description": "Up to 3 pieces (with colors) that would unlock more outfits in this style"},
        },
        "required": ["outfits"],
    },
}

CATALOG_KEYS = ["category", "subcategory", "name", "primary_color", "colors", "pattern", "material",
                "fit", "formality", "seasons", "styles", "notes"]


def catalog(items):
    lines = []
    for n, it in enumerate(items, start=1):
        bits = {k: it.get(k) for k in CATALOG_KEYS if it.get(k)}
        if it.get("favorite"):
            bits["favorite"] = True
        if it.get("times_worn"):
            bits["times_worn"] = it["times_worn"]
        lines.append(f"{n}. " + json.dumps(bits, ensure_ascii=False))
    return "\n".join(lines)


def num(v):
    """Numbers as a person writes them: 36, 36.5 (never 36.0)."""
    return f"{v:g}" if isinstance(v, (int, float)) and not isinstance(v, bool) else str(v)


def profile_text(profile):
    m = profile.get("measurements") or {}
    out = []
    if m:
        h = m.get("height")
        parts = [f"height {int(h // 12)}'{num(h % 12)}\"" if h else None]
        parts += [f"{k.replace('_', ' ')} {num(v)}\"" for k, v in m.items() if k not in ("height", "weight") and v]
        out.append("Measurements (inches): " + ", ".join(p for p in parts if p))
    if profile.get("sizes"):
        out.append("Usual sizes: " + ", ".join(f"{k} {v}" for k, v in profile["sizes"].items()))
    if profile.get("fit_notes"):
        out.append("What she likes to show off / play down: " + profile["fit_notes"])
    if profile.get("color_notes"):
        out.append("Colors she loves / avoids: " + profile["color_notes"])
    if profile.get("my_styles"):
        out.append("Her favorite styles: " + ", ".join(profile["my_styles"]))
    return "\n".join(out) or "(No profile details entered yet.)"


def outfit_prompt(usable, profile, style, style_desc="", occasion="", season="", count=4):
    return f"""You are a warm, practical personal stylist helping a woman put together outfits from her own closet.

ABOUT HER
{profile_text(profile)}

WHAT SHE WANTS
Style: {style}{f" — {style_desc}" if style_desc else ""}
Occasion / plans: {occasion or "everyday"}
Season / weather: {season or "any"}

HER CLOSET (number. details)
{catalog(usable)}

Create {count} different outfits using ONLY item numbers from her closet.
Rules:
- Each outfit is complete: either a dress/jumpsuit, or a top (or sweater) plus a bottom. Add shoes if she has suitable ones; add outerwear, a bag or accessories when they help.
- Fit the requested style, occasion and season. Respect her color likes/dislikes and what she wants to show off or play down; use her measurements to favor flattering proportions.
- Make the outfits genuinely different from each other. Favor favorites and pieces she hasn't worn much.
- If her closet can't make {count} good outfits for this request, return fewer rather than forcing bad ones, and say what's missing in closet_gaps."""


def outfit_request(usable, profile, style, style_desc, occasion, season, count, model):
    return tool_request(OUTFIT_TOOL, outfit_prompt(usable, profile, style, style_desc, occasion, season, count), 3000, model)


def read_outfits(data, usable):
    """Model answer → outfits made of real closet items (bad or repeated numbers dropped)."""
    out = []
    for o in data.get("outfits") or []:
        picked, seen = [], set()
        for n in o.get("items") or []:
            if isinstance(n, int) and not isinstance(n, bool) and 1 <= n <= len(usable) and n not in seen:
                seen.add(n)
                picked.append(usable[n - 1])
        if picked:
            out.append({"title": o.get("title", "Outfit"), "items": picked, "why": o.get("why", ""),
                        "tip": o.get("tip", ""), "add_piece": o.get("add_piece", "")})
    return {"outfits": out, "closet_gaps": [g for g in (data.get("closet_gaps") or []) if g][:3]}
