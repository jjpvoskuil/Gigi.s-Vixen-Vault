"""AI helpers (Claude): describe clothing photos and pick outfits."""
import base64

import anthropic
import streamlit as st

from lib import ailogic, config

CATEGORIES = ailogic.CATEGORIES
FORMALITY = ailogic.FORMALITY
SEASONS = ailogic.SEASONS


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


def _call_tool(tool, content, max_tokens, client=None):
    """Asks the model to answer by calling `tool`; returns the tool input as a dict (retries once)."""
    req = ailogic.tool_request(tool, content, max_tokens, config.anthropic_model())
    c = client or _client()
    for _ in range(2):
        msg = c.messages.create(**req)
        blocks = [{"type": b.type, "name": getattr(b, "name", None), "input": getattr(b, "input", None)} for b in msg.content]
        data = ailogic.tool_answer({"content": blocks}, req["tools"][0]["name"])
        if data is not None:
            return data
    raise RuntimeError("The AI answered without filling in the details — please try again.")


PLACEHOLDER_NAMES = ailogic.PLACEHOLDER_NAMES
is_untagged = ailogic.is_untagged
_tag_tool = ailogic.tag_tool


def tag_item(jpeg_bytes: bytes, style_names: list, client=None) -> dict:
    """Looks at a clothing photo and returns catalog fields. Raises on API errors."""
    req = ailogic.tag_request(base64.b64encode(jpeg_bytes).decode(), style_names, config.anthropic_model())
    c = client or _client()
    for _ in range(2):
        msg = c.messages.create(**req)
        blocks = [{"type": b.type, "name": getattr(b, "name", None), "input": getattr(b, "input", None)} for b in msg.content]
        data = ailogic.tool_answer({"content": blocks}, "record_item")
        if data is not None:
            return ailogic.clean_tag(data)
    raise RuntimeError("The AI answered without filling in the details — please try again.")


# ---------------------------------------------------------------- outfits
OUTFIT_TOOL = ailogic.OUTFIT_TOOL


def suggest_outfits(items, profile, style, style_desc="", occasion="", season="", count=4):
    """Returns {'outfits': [{title, items: [item dicts], why, tip, add_piece}], 'closet_gaps': [...]}."""
    usable = [it for it in items if not is_untagged(it)]
    data = _call_tool(OUTFIT_TOOL, ailogic.outfit_prompt(usable, profile, style, style_desc, occasion, season, count), 3000)
    return ailogic.read_outfits(data, usable)
