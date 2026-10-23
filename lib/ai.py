"""AI helpers (Claude). Stage 1: describe and tag a clothing photo."""
import base64

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
    return anthropic.Anthropic(api_key=config.anthropic_key())


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


def tag_item(jpeg_bytes: bytes, style_names: list) -> dict:
    """Looks at a clothing photo and returns catalog fields. Raises on API errors."""
    tool = _tag_tool(style_names)
    msg = _client().messages.create(
        model=config.anthropic_model(),
        max_tokens=1024,
        tools=[tool],
        tool_choice={"type": "tool", "name": "record_item"},
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg",
                                             "data": base64.b64encode(jpeg_bytes).decode()}},
                {"type": "text", "text": (
                    "This is a photo of one item from a woman's closet, taken on her phone. "
                    "Catalog the main garment or accessory in the photo. Ignore the background, "
                    "hangers and anything else in frame. Use everyday color names a shopper would use."
                )},
            ],
        }],
    )
    for block in msg.content:
        if block.type == "tool_use":
            data = dict(block.input)
            if data.get("category") not in CATEGORIES:
                data["category"] = "other"
            return data
    raise RuntimeError("The AI didn't return item details.")
