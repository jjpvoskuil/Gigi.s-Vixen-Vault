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
    key = _get("ANTHROPIC_API_KEY")
    return key.strip().strip('"').strip("'").strip() if isinstance(key, str) else key


def anthropic_key_problem():
    """A plain-English guess at what's wrong with the key's shape (never reveals the key)."""
    key = anthropic_key() or ""
    if not key:
        return "No key is set."
    if "…" in key or "..." in key:
        return "The saved key contains '…' — that's the shortened version the console displays, not the full key."
    if not key.startswith("sk-ant-"):
        return "The saved key doesn't start with 'sk-ant-', so it isn't an Anthropic API key."
    if len(key) < 90:
        return f"The saved key is only {len(key)} characters long — full keys are about 108, so part of it is missing."
    if any(c.isspace() for c in key):
        return "The saved key has a space or line break in the middle."
    return ("The key looks complete, so it has probably been deleted or replaced in the console "
            "(or belongs to an account without access).")


def anthropic_model():
    return _get("ANTHROPIC_MODEL", DEFAULT_MODEL)


def supabase_settings():
    return {
        "url": _get("supabase.url"),
        "key": _get("supabase.key"),
        "bucket": _get("supabase.bucket", "vault"),
    }


def github_settings():
    return {
        "token": _get("github.token"),
        "repo": _get("github.repo", "jjpvoskuil/Gigi.s-Vixen-Vault"),
        "branch": _get("github.branch", "punch-list"),
    }


def launcher_url():
    return _get("LAUNCHER_URL", "https://jjpvoskuil.github.io/vixen-vault-home/")


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
