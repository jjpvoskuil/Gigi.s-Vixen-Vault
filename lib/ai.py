"""AI helpers (Claude): describe clothing photos and pick outfits."""
import base64
import json

import anthropic
import streamlit as st

from lib import config

CATEGORIES = [
    "top", "bottom", "dress", "jumpsuit", "outerwear", "sweater", "activewear",
    "swimwear", "shoes", "bag", "accessory", "jewelry", "sleepwear", "other",
]
FORMALITY = ["very casual", "casual", "smart casual", "business", "dressy", "formal"]
SEASONS = ["spring", "summer", "fall", "winter"]


@st.cache_resource(show_spinner=False)
def _client():
    # retries cover "busy"/rate-limit replies when many photos are processed at once
    return anthropic.Anthropic(api_key=config.anthropic_key(), max_retries=5, timeout=90)


def friendly_error(e: Exception) -> str:
    """Turns an API error into something John can act on."""
    text = str(e)
    low = text.lower()
    if isinstance(e, anthropic.AuthenticationError):
        return ("The Anthropic API key wasn't accepted. " + config.anthropic_key_problem() +
                " Create a new key at platform.claude.com → Settings → API Keys, paste it into Streamlit's Secrets "
                "as ANTHROPIC_API_KEY, save, and reboot the app.")
    if "credit balance" in low or "billing" in low:
        return "The Anthropic account is out of credit — add credit at platform.claude.com/settings/billing."
    if isinstance(e, anthropic.NotFoundError) or "model" in low and "not found" in low:
        return f"The AI model name isn't recognized ({config.anthropic_model()}) — check ANTHROPIC_MODEL in Secrets."
    if isinstance(e, anthropic.RateLimitError):
        return "The AI service is busy (rate limit) — wait a minute and try again."
    if isinstance(e, anthropic.APIConnectionError):
        return "Couldn't reach the AI service — check the connection and try again."
    return text[:300]


def _strictify(schema):
    """Strict tools need additionalProperties:false and every property listed as required."""
    if isinstance(schema, dict):
        if schema.get("type") == "object" and "properties" in schema:
            schema["additionalProperties"] = False
            schema["required"] = list(schema["properties"].keys())
        for v in list(schema.values()):
            _strictify(v)
    elif isinstance(schema, list):
        for v in schema:
            _strictify(v)
    return schema


def _call_tool(tool, content, max_tokens, client=None):
    """Asks the model to answer by calling `tool`; returns the tool input as a dict.
    Newer models reject forced tool_choice, so we use auto + strict and retry once if needed."""
    import copy
    t = copy.deepcopy(tool)
    _strictify(t["input_schema"])
    t["strict"] = True
    instruction = f"\n\nAnswer only by calling the {t['name']} tool."
    if isinstance(content, str):
        content = content + instruction
    else:
        content = list(content) + [{"type": "text", "text": instruction.strip()}]
    c = client or _client()
    for _ in range(2):
        msg = c.messages.create(
            model=config.anthropic_model(),
            max_tokens=max_tokens,
            tools=[t],
            tool_choice={"type": "auto"},
            messages=[{"role": "user", "content": content}],
        )
        for block in msg.content:
            if block.type == "tool_use" and block.name == t["name"]:
                return dict(block.input)
    raise RuntimeError("The AI answered without filling in the details — please try again.")


PLACEHOLDER_NAMES = {"", "new item"}


def is_untagged(item: dict) -> bool:
    """Items saved without a proper description: blank description, or still named 'New item'
    (what the app saves when the AI step fails)."""
    return (not (item.get("description") or "").strip()
            or (item.get("name") or "").strip().lower() in PLACEHOLDER_NAMES)


def _tag_tool(style_names):
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


def tag_item(jpeg_bytes: bytes, style_names: list, client=None) -> dict:
    """Looks at a clothing photo and returns catalog fields. Raises on API errors."""
    tool = _tag_tool(style_names)
    data = _call_tool(tool, [
        {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                     "data": base64.b64encode(jpeg_bytes).decode()}},
        {"type": "text", "text": (
            "This is a photo of one item from a woman's closet, taken on her phone. "
            "Catalog the main garment or accessory in the photo. Ignore the background, "
            "hangers and anything else in frame. Use everyday color names a shopper would use. "
            "Use an empty string for anything you can't tell (e.g. brand)."
        )},
    ], 1024, client)
    if data.get("category") not in CATEGORIES:
        data["category"] = "other"
    return data


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

_CATALOG_KEYS = ["category", "subcategory", "name", "primary_color", "colors", "pattern", "material",
                 "fit", "formality", "seasons", "styles", "notes"]


def _catalog(items):
    lines = []
    for n, it in enumerate(items, start=1):
        bits = {k: it.get(k) for k in _CATALOG_KEYS if it.get(k)}
        if it.get("favorite"):
            bits["favorite"] = True
        if it.get("times_worn"):
            bits["times_worn"] = it["times_worn"]
        lines.append(f"{n}. " + json.dumps(bits, ensure_ascii=False))
    return "\n".join(lines)


def _profile_text(profile):
    m = profile.get("measurements") or {}
    out = []
    if m:
        h = m.get("height")
        parts = [f"height {int(h // 12)}'{h % 12:g}\"" if h else None]
        parts += [f"{k.replace('_', ' ')} {v}\"" for k, v in m.items() if k not in ("height", "weight") and v]
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


def suggest_outfits(items, profile, style, style_desc="", occasion="", season="", count=4):
    """Returns {'outfits': [{title, items: [item dicts], why, tip, add_piece}], 'closet_gaps': [...]}."""
    usable = [it for it in items if not is_untagged(it)]
    prompt = f"""You are a warm, practical personal stylist helping a woman put together outfits from her own closet.

ABOUT HER
{_profile_text(profile)}

WHAT SHE WANTS
Style: {style}{f" — {style_desc}" if style_desc else ""}
Occasion / plans: {occasion or "everyday"}
Season / weather: {season or "any"}

HER CLOSET (number. details)
{_catalog(usable)}

Create {count} different outfits using ONLY item numbers from her closet.
Rules:
- Each outfit is complete: either a dress/jumpsuit, or a top (or sweater) plus a bottom. Add shoes if she has suitable ones; add outerwear, a bag or accessories when they help.
- Fit the requested style, occasion and season. Respect her color likes/dislikes and what she wants to show off or play down; use her measurements to favor flattering proportions.
- Make the outfits genuinely different from each other. Favor favorites and pieces she hasn't worn much.
- If her closet can't make {count} good outfits for this request, return fewer rather than forcing bad ones, and say what's missing in closet_gaps."""
    data = _call_tool(OUTFIT_TOOL, prompt, 3000)
    out = []
    for o in data.get("outfits") or []:
        picked, seen = [], set()
        for n in o.get("items") or []:
            if isinstance(n, int) and 1 <= n <= len(usable) and n not in seen:
                seen.add(n)
                picked.append(usable[n - 1])
        if picked:
            out.append({"title": o.get("title", "Outfit"), "items": picked, "why": o.get("why", ""),
                        "tip": o.get("tip", ""), "add_piece": o.get("add_piece", "")})
    return {"outfits": out, "closet_gaps": [g for g in (data.get("closet_gaps") or []) if g][:3]}
