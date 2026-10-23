"""Reads settings from Streamlit secrets and reports anything missing."""
import streamlit as st

DEFAULT_MODEL = "claude-sonnet-5-5"


def _get(path, default=None):
    try:
        node = st.secrets
        for part in path.split("."):
            node = node[part]
        return node
    except Exception:
        return default


def app_password():
    return _get("APP_PASSWORD")


def anthropic_key():
    return _get("ANTHROPIC_API_KEY")


def anthropic_model():
    return _get("ANTHROPIC_MODEL", DEFAULT_MODEL)


def supabase_settings():
    return {
        "url": _get("supabase.url"),
        "key": _get("supabase.key"),
        "bucket": _get("supabase.bucket", "vault"),
    }


def missing_settings():
    """List of human-readable settings that still need to be filled in."""
    missing = []
    if not app_password():
        missing.append("APP_PASSWORD")
    sb = supabase_settings()
    if not sb["url"]:
        missing.append("supabase.url")
    if not sb["key"]:
        missing.append("supabase.key")
    return missing


def ai_enabled():
    return bool(anthropic_key())
