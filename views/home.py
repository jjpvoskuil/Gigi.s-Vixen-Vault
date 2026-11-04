from collections import Counter
from urllib.parse import quote, urlsplit

import streamlit as st

from lib import ai, auth, config, db, icon, ui

st.markdown("<div class='vv-hero'><div class='vv-title'>Gigi's Vixen Vault</div>"
            "<div class='vv-sub'>Your closet, your style.</div></div>", unsafe_allow_html=True)

items = db.list_items()
profile = db.get_profile()
body = db.list_body_photos()

untagged_n = sum(1 for i in items if ai.is_untagged(i))
with st.container(key="grid_stats"):
    c1, c2, c3 = st.columns(3)
    with c1:
        ui.stat("pieces", len(items))
    with c2:
        ui.stat("favorites", sum(1 for i in items if i.get("favorite")))
    with c3:
        ui.stat("my styles", len(profile.get("my_styles") or []))

st.write("")
st.page_link("views/outfits.py", label="Get outfit ideas", icon=":material/styler:")
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

if untagged_n:
    st.warning(f"{untagged_n} closet items still need a description before they can be used in outfits.",
               icon=":material/auto_awesome:")
    st.page_link("views/closet.py", label="Describe them now (Closet)", icon=":material/checkroom:")
st.caption("Coming next: see outfits on you (try-on).")

st.write("")
with st.expander("Phone icon", icon=":material/smartphone:"):
    icon.status()
    st.markdown("**iPhone (Safari):** tap **Share → Add to Home Screen** right here.\n\n"
                "**Android (Chrome):** tap the button below, then **⋮ → Add to Home screen** "
                "on the purple page that opens. (Also works on iPhone if the fox doesn't show.)")
    parts = urlsplit(st.context.url or "")
    app_url = f"{parts.scheme}://{parts.netloc}/" if parts.netloc else ""
    if app_url.startswith("https://") and app_url.rstrip("/").endswith(".streamlit.app"):
        link = f"{config.launcher_url()}#app={quote(app_url, safe='')}&k={auth.token()}"
        st.link_button("Set up phone icon", link, type="primary", use_container_width=True)
    else:
        st.caption("The button appears once the app is running on Streamlit Cloud.")

if st.button("Log out", type="tertiary"):
    auth.logout()
