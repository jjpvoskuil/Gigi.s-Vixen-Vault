"""Closet search, filter and sort rules — the reference the web app (web/src/lib/closet.js) is tested against.
No Streamlit here so it can be imported by tests and fixture scripts."""

SEARCH_FIELDS = ["name", "category", "subcategory", "primary_color", "pattern", "material",
                 "fit", "description", "brand", "notes"]
SORTS = ["Newest", "Category", "Color", "Most worn", "Least worn"]


def matches(item, q="", cats=None, styles=None, seasons=None, fav=False):
    if cats and (item.get("category") or "other") not in cats:
        return False
    if fav and not item.get("favorite"):
        return False
    if styles and not set(styles) & set(item.get("styles") or []):
        return False
    if seasons and not set(seasons) & set(item.get("seasons") or []):
        return False
    if q:
        hay = " ".join(str(item.get(k) or "") for k in SEARCH_FIELDS)
        hay += " " + " ".join((item.get("colors") or []) + (item.get("styles") or []))
        return all(word in hay.lower() for word in q.lower().split())
    return True


def sort_items(items, sort="Newest"):
    """Items arrive newest first (database order); other sorts are stable on top of that."""
    out = list(items)
    if sort == "Category":
        out.sort(key=lambda i: (i.get("category") or "", i.get("subcategory") or ""))
    elif sort == "Color":
        out.sort(key=lambda i: (i.get("primary_color") or "").lower())
    elif sort == "Most worn":
        out.sort(key=lambda i: -(i.get("times_worn") or 0))
    elif sort == "Least worn":
        out.sort(key=lambda i: i.get("times_worn") or 0)
    return out


def filter_sort(items, q="", cats=None, styles=None, seasons=None, fav=False, sort="Newest"):
    return sort_items([i for i in items if matches(i, q, cats, styles, seasons, fav)], sort)
