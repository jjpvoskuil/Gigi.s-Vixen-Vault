"""Punch list stored as JSON on a separate 'punch-list' branch of the GitHub repo.

Why GitHub: Claude (the developer) reads the same file to pick up new requests,
and writes status/notes back. Using its own branch means saving an item never
redeploys or restarts the app (Streamlit only watches 'main').
"""
import base64
import json
import time
import uuid
from datetime import datetime, timezone

import requests
import streamlit as st

from lib import config

FILE = "punch_list.json"
API = "https://api.github.com"

STATUSES = ["Open", "In progress", "Done", "Won't do"]
TYPES = ["Bug", "Change", "New idea", "Question"]
PRIORITIES = ["High", "Normal", "Low"]
PAGES = ["Home", "Add", "Closet", "Me – Measurements", "Me – Photos", "Me – Styles",
         "Punch List", "Phone icon / login", "Outfits (future)", "Other"]


def _gh():
    return config.github_settings()


def enabled():
    g = _gh()
    return bool(g["token"] and g["repo"])


def _headers():
    return {"Authorization": f"Bearer {_gh()['token']}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"}


def _url(path):
    return f"{API}/repos/{_gh()['repo']}/contents/{path}"


def _branch():
    return _gh()["branch"]


def _ensure_branch():
    """Creates the punch-list branch from main the first time."""
    g = _gh()
    r = requests.get(f"{API}/repos/{g['repo']}/git/ref/heads/{g['branch']}", headers=_headers(), timeout=20)
    if r.status_code == 200:
        return
    main = requests.get(f"{API}/repos/{g['repo']}/git/ref/heads/main", headers=_headers(), timeout=20)
    main.raise_for_status()
    requests.post(f"{API}/repos/{g['repo']}/git/refs", headers=_headers(), timeout=20,
                  json={"ref": f"refs/heads/{g['branch']}", "sha": main.json()["object"]["sha"]}).raise_for_status()


def _read():
    """Returns (items, sha)."""
    r = requests.get(_url(FILE), headers=_headers(), params={"ref": _branch()}, timeout=20)
    if r.status_code == 404:
        return [], None
    r.raise_for_status()
    body = r.json()
    data = json.loads(base64.b64decode(body["content"]).decode() or "{}")
    return data.get("items", []), body["sha"]


def _write(items, sha, message):
    payload = {
        "message": message,
        "branch": _branch(),
        "content": base64.b64encode(
            json.dumps({"items": items}, indent=2, ensure_ascii=False).encode()).decode(),
    }
    if sha:
        payload["sha"] = sha
    r = requests.put(_url(FILE), headers=_headers(), json=payload, timeout=30)
    if r.status_code in (409, 422):
        raise _Conflict()
    r.raise_for_status()


class _Conflict(Exception):
    pass


def _modify(fn, message):
    """Read-modify-write with retry if someone else (e.g. Claude) saved in between."""
    _ensure_branch()
    for attempt in range(4):
        items, sha = _read()
        fn(items)
        try:
            _write(items, sha, message)
            load.clear()
            return
        except _Conflict:
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError("Couldn't save — please try again.")


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@st.cache_data(ttl=60, show_spinner=False)
def load():
    try:
        return _read()[0]
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            return []
        raise


def add(fields: dict, screenshot: bytes | None = None):
    item_id = uuid.uuid4().hex[:8]
    shot_path = None
    if screenshot:
        _ensure_branch()
        shot_path = f"screenshots/{item_id}.jpg"
        requests.put(_url(shot_path), headers=_headers(), timeout=60, json={
            "message": f"Screenshot for punch item {item_id}",
            "branch": _branch(),
            "content": base64.b64encode(screenshot).decode(),
        }).raise_for_status()
    item = {
        "id": item_id,
        "created": _now(),
        "updated": _now(),
        "type": fields.get("type", "Change"),
        "page": fields.get("page", "Other"),
        "priority": fields.get("priority", "Normal"),
        "title": fields.get("title", "").strip(),
        "details": fields.get("details", "").strip(),
        "added_by": fields.get("added_by", ""),
        "status": "Open",
        "screenshot": shot_path,
        "dev_notes": "",
    }
    _modify(lambda items: items.append(item), f"Punch list: add “{item['title'][:60]}”")
    return item


def update(item_id, fields: dict):
    def fn(items):
        for it in items:
            if it["id"] == item_id:
                it.update(fields)
                it["updated"] = _now()
    _modify(fn, f"Punch list: update {item_id}")


def delete(item_id):
    _modify(lambda items: items.__setitem__(slice(None), [i for i in items if i["id"] != item_id]),
            f"Punch list: delete {item_id}")


@st.cache_data(ttl=3600, show_spinner=False)
def screenshot(path):
    r = requests.get(_url(path), headers={**_headers(), "Accept": "application/vnd.github.raw+json"},
                     params={"ref": _branch()}, timeout=30)
    r.raise_for_status()
    return r.content
