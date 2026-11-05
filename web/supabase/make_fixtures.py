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
