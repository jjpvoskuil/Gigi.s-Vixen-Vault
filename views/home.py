from collections import Counter

import streamlit as st

from lib import auth, db, ui

st.markdown("<div class='vv-hero'><div class='vv-title'>Gigi's Vixen Vault</div>"
            "<div class='vv-sub'>Your closet, your style.</div></div>", unsafe_allow_html=True)

items = db.list_items()
profile = db.get_profile()
body = db.list_body_photos()

c1, c2, c3 = st.columns(3)
with c1:
    ui.stat("pieces", len(items))
with c2:
    ui.stat("favorites", sum(1 for i in items if i.get("favorite")))
with c3:
    ui.stat("my styles", len(profile.get("my_styles") or []))

st.write("")
st.page_link("views/add.py", label="Add clothes", icon=":material/add_a_photo:")
st.page_link("views/closet.py", label="Browse my closet", icon=":material/checkroom:")
st.page_link("views/profile.py", label="My measurements, photos & styles", icon=":material/person:")

if items:
    st.subheader("What's in the vault")
    counts = Counter(i.get("category") or "other" for i in items)
    ui.chips([f"{k} · {v}" for k, v in counts.most_common()])

todo = []
if not items:
    todo.append("Add a few pieces from your closet (tap **Add**).")
if not (profile.get("measurements") or {}):
    todo.append("Enter your measurements under **Me**.")
if not body:
    todo.append("Add a full-length photo of yourself under **Me → Photos**.")
if not profile.get("my_styles"):
    todo.append("Pick your favorite styles under **Me → Styles**.")
if todo:
    st.subheader("Getting started")
    for t in todo:
        st.markdown(f"- {t}")

st.info("Coming next: pick a style and get outfits from your closet, then see them on you.",
        icon=":material/auto_awesome:")

st.write("")
if st.button("Log out", type="tertiary"):
    auth.logout()
