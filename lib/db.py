"""All reads/writes to Supabase (database + private photo storage)."""
import time
import uuid
from datetime import datetime, timezone

import streamlit as st
from supabase import create_client

from lib import config

SIGNED_URL_SECONDS = 60 * 60 * 6


def _now():
    return datetime.now(timezone.utc).isoformat()

ITEM_FIELDS = [
    "name", "category", "subcategory", "primary_color", "colors", "pattern",
    "material", "fit", "formality", "seasons", "styles", "description",
    "brand", "size", "notes", "favorite", "times_worn",
]


@st.cache_resource(show_spinner=False)
def client():
    s = config.supabase_settings()
    return create_client(s["url"], s["key"])


def _bucket():
    return client().storage.from_(config.supabase_settings()["bucket"])


# ------------------------------------------------------------------ photos
def upload_photo(folder: str, full: bytes, thumb: bytes):
    """Stores a photo and its thumbnail; returns (image_path, thumb_path)."""
    stem = f"{folder}/{time.strftime('%Y%m%d')}-{uuid.uuid4().hex[:12]}"
    image_path, thumb_path = f"{stem}.jpg", f"{stem}_thumb.jpg"
    opts = {"content-type": "image/jpeg", "upsert": "true"}
    _bucket().upload(image_path, full, opts)
    _bucket().upload(thumb_path, thumb, opts)
    return image_path, thumb_path


def delete_photos(*paths):
    paths = [p for p in paths if p]
    if paths:
        try:
            _bucket().remove(paths)
        except Exception:
            pass


@st.cache_data(ttl=SIGNED_URL_SECONDS - 600, show_spinner=False)
def signed_urls(paths: tuple) -> dict:
    """Map of storage path -> temporary private link for display."""
    paths = [p for p in paths if p]
    if not paths:
        return {}
    res = _bucket().create_signed_urls(paths, SIGNED_URL_SECONDS)
    out = {}
    for r in res or []:
        url = r.get("signedURL") or r.get("signedUrl") or r.get("signed_url")
        if r.get("path") and url:
            out[r["path"]] = url
    return out


def download_photo(path: str) -> bytes:
    return _bucket().download(path)


# ------------------------------------------------------------------ items
def list_items():
    res = client().table("items").select("*").order("created_at", desc=True).execute()
    return res.data or []


def get_item(item_id):
    res = client().table("items").select("*").eq("id", item_id).limit(1).execute()
    return (res.data or [None])[0]


def add_item(fields: dict):
    row = {k: v for k, v in fields.items() if k in ITEM_FIELDS + ["image_path", "thumb_path"]}
    res = client().table("items").insert(row).execute()
    return (res.data or [None])[0]


def update_item(item_id, fields: dict):
    row = {k: v for k, v in fields.items() if k in ITEM_FIELDS}
    row["updated_at"] = _now()
    client().table("items").update(row).eq("id", item_id).execute()


def delete_item(item):
    client().table("items").delete().eq("id", item["id"]).execute()
    delete_photos(item.get("image_path"), item.get("thumb_path"))


# ------------------------------------------------------------------ profile
def get_profile():
    res = client().table("profile").select("*").eq("id", 1).limit(1).execute()
    if res.data:
        return res.data[0]
    client().table("profile").upsert({"id": 1}).execute()
    return {"id": 1, "measurements": {}, "sizes": {}, "my_styles": [], "fit_notes": "", "color_notes": ""}


def save_profile(fields: dict):
    fields = dict(fields)
    fields["id"] = 1
    fields["updated_at"] = _now()
    client().table("profile").upsert(fields).execute()


# ------------------------------------------------------------------ body photos
def list_body_photos():
    res = client().table("body_photos").select("*").order("created_at").execute()
    return res.data or []


def add_body_photo(label, image_path, thumb_path):
    client().table("body_photos").insert(
        {"label": label, "image_path": image_path, "thumb_path": thumb_path}
    ).execute()


def delete_body_photo(photo):
    client().table("body_photos").delete().eq("id", photo["id"]).execute()
    delete_photos(photo.get("image_path"), photo.get("thumb_path"))


# ------------------------------------------------------------------ styles
def list_styles():
    res = client().table("styles").select("*").order("sort_order").order("name").execute()
    return res.data or []


def add_style(name, description=""):
    client().table("styles").upsert(
        {"name": name.strip(), "description": description.strip(), "custom": True, "sort_order": 200}
    ).execute()


def delete_style(name):
    client().table("styles").delete().eq("name", name).execute()
