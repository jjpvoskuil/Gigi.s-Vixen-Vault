"""Fixtures for the web app's parity tests: run the Python closet rules on sample items and record the answers.
    python web/supabase/make_fixtures.py   (writes web/src/lib/closet.fixtures.json)"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from lib import closetlogic  # noqa: E402
from lib.ai import is_untagged  # noqa: E402 (needs streamlit + anthropic installed)

ITEMS = [
    {"id": "a", "name": "Navy striped tee", "category": "top", "subcategory": "t-shirt", "primary_color": "Navy",
     "colors": ["navy", "white"], "styles": ["Casual Chic"], "seasons": ["summer"], "favorite": True, "times_worn": 4,
     "description": "Soft cotton tee.", "material": "cotton", "pattern": "striped"},
    {"id": "b", "name": "Light-wash jeans", "category": "bottom", "subcategory": "jeans", "primary_color": "light blue",
     "colors": ["blue"], "styles": ["Casual Chic", "Lake Life"], "seasons": ["spring", "fall"], "times_worn": 9,
     "description": "High rise.", "material": "denim"},
    {"id": "c", "name": "New item", "category": "other", "description": "", "times_worn": 0},
    {"id": "d", "name": "Red slip dress", "category": "dress", "subcategory": "slip", "primary_color": "red",
     "colors": ["red"], "styles": ["Date Night"], "seasons": ["summer"], "favorite": True, "times_worn": 2,
     "description": "Satin, bias cut.", "brand": "Reformation", "notes": "needs a strapless bra"},
    {"id": "e", "name": "Black leather boots", "category": "shoes", "subcategory": "ankle boots", "primary_color": "Black",
     "colors": ["black"], "styles": ["Edgy", "Western / Country"], "seasons": ["fall", "winter"], "times_worn": 9,
     "description": "Buckled.", "material": "leather"},
    {"id": "f", "name": "Camel sweater", "category": "sweater", "subcategory": "", "primary_color": "camel",
     "colors": ["camel"], "styles": [], "seasons": ["fall", "winter"], "times_worn": None, "description": "  "},
    {"id": "g", "name": "  NEW ITEM ", "category": None, "description": "her own words", "times_worn": 1},
    {"id": "h", "name": "Plum cami", "category": "top", "subcategory": "cami", "primary_color": "plum",
     "colors": ["plum"], "styles": ["Date Night"], "seasons": ["spring", "summer"], "times_worn": 4,
     "description": "Lace trim.", "pattern": "lace"},
]
CASES = [
    {}, {"q": "navy"}, {"q": "LEATHER black"}, {"q": "date night"}, {"q": "strapless"}, {"q": "nothing-here"},
    {"cats": ["top"]}, {"cats": ["other"]}, {"cats": ["top", "dress"], "fav": True}, {"styles": ["Date Night"]},
    {"seasons": ["winter"]}, {"seasons": ["summer"], "q": "  red  "}, {"fav": True},
    {"sort": "Category"}, {"sort": "Color"}, {"sort": "Most worn"}, {"sort": "Least worn"},
    {"cats": ["top"], "sort": "Most worn"}, {"q": "e", "sort": "Color"},
]

out = {"items": ITEMS, "untagged": [i["id"] for i in ITEMS if is_untagged(i)], "cases": []}
for c in CASES:
    res = closetlogic.filter_sort(ITEMS, c.get("q", ""), c.get("cats"), c.get("styles"), c.get("seasons"),
                                  c.get("fav", False), c.get("sort", "Newest"))
    out["cases"].append({"args": c, "ids": [i["id"] for i in res]})
dest = ROOT / "web" / "src" / "lib" / "closet.fixtures.json"
dest.write_text(json.dumps(out, indent=1) + "\n")
print(f"wrote {dest} ({len(CASES)} cases)")

# ---------------------------------------------------------------- AI rules (lib/ailogic.py → ai.fixtures.json)
from lib import ailogic  # noqa: E402

PROFILES = [
    {},
    {"measurements": {"height": 65.5, "bust": 36, "waist": 29.5, "high_hip": 37.25, "weight": 140, "thigh": 0},
     "sizes": {"tops": "M", "bra": "34C"}, "my_styles": ["Edgy", "Date Night"], "fit_notes": "love my waist",
     "color_notes": "jewel tones; no mustard"},
    {"measurements": {"height": 60}, "sizes": {}, "my_styles": [], "fit_notes": "", "color_notes": ""},
    {"measurements": {}, "sizes": {"shoes": "8.5"}, "my_styles": ["Boho"]},
]
STYLE_NAMES = ["Casual Chic", "Date Night", "Edgy"]
usable = [i for i in ITEMS if not ailogic.is_untagged(i)]
MERGE = [
    ({"name": "New item", "description": "", "notes": ""}, {"name": "Black tee", "category": "top", "description": "Soft.", "brand": "Gap", "extra": 1}),
    ({"name": "New Item", "description": "black top from Target", "brand": "Target", "notes": None}, {"name": "Black tee", "brand": "Gap", "size": "M", "description": "Soft."}),
    ({"name": "My fav tee", "description": "New item", "notes": "runs small", "size": "S"}, {"name": "Tee", "size": "M", "description": "x"}),
    ({"name": "", "description": "Soft", "notes": "Soft and comfy"}, {"name": "Cami", "description": "Silk cami."}),
    ({"name": "  new item ", "description": "  ", "notes": "a\nb"}, {"name": "Skirt", "notes": "ignored?", "favorite": True}),
]
RAW_OUTFITS = [
    {"outfits": [{"title": "Night Out", "items": [1, 2, 2, 99, 0, 3], "why": "w", "tip": "t", "add_piece": "boots"},
                 {"title": "Empty", "items": [42], "why": "", "tip": ""},
                 {"items": [4, 1.5, True], "why": "x", "tip": "y"}],
     "closet_gaps": ["a", "", "b", "c", "d"]},
    {"outfits": []}, {},
]
ai_out = {
    "items": ITEMS,
    "untagged": [i["id"] for i in ITEMS if ailogic.is_untagged(i)],
    "catalog": ailogic.catalog(usable),
    "profiles": [{"profile": p, "text": ailogic.profile_text(p)} for p in PROFILES],
    "tag_requests": [{"styles": s, "request": ailogic.tag_request("IMGDATA", s, "model-x")} for s in (STYLE_NAMES, [])],
    "outfit_requests": [
        {"args": ["Edgy", "Leather & hardware", "date night", "fall", 4, 1],
         "request": ailogic.outfit_request(usable, PROFILES[1], "Edgy", "Leather & hardware", "date night", "fall", 4, "model-x")},
        {"args": ["Boho", "", "", "", 2, 0],
         "request": ailogic.outfit_request(usable, PROFILES[0], "Boho", "", "", "", 2, "model-x")},
    ],
    "merge": [{"item": a, "fields": b, "row": ailogic.merge_describe(a, b)} for a, b in MERGE],
    "read_outfits": [{"data": d, "result": {**(r := ailogic.read_outfits(d, usable)),
                                            "outfits": [{**o, "items": [i["id"] for i in o["items"]]} for o in r["outfits"]]}}
                     for d in RAW_OUTFITS],
    "tool_answer": [
        {"message": {"content": [{"type": "text", "text": "hi"}, {"type": "tool_use", "name": "record_item", "input": {"a": 1}}]}, "name": "record_item",
         "result": ailogic.tool_answer({"content": [{"type": "text", "text": "hi"}, {"type": "tool_use", "name": "record_item", "input": {"a": 1}}]}, "record_item")},
        {"message": {"content": [{"type": "text", "text": "prose"}]}, "name": "record_item", "result": None},
    ],
    "clean_tag": [{"in": {"category": "blouse"}, "out": ailogic.clean_tag({"category": "blouse"})},
                  {"in": {"category": "dress"}, "out": ailogic.clean_tag({"category": "dress"})}],
}
dest = ROOT / "web" / "src" / "lib" / "ai.fixtures.json"
dest.write_text(json.dumps(ai_out, indent=1, ensure_ascii=False) + "\n")
print(f"wrote {dest}")
