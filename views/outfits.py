import html

import streamlit as st

from lib import ai, config, db, ui

st.title("Outfits")

if not config.ai_enabled():
    st.warning("Outfit picks need the AI key. Add `ANTHROPIC_API_KEY` in Streamlit → Settings → Secrets.")
    st.stop()

items = db.list_items()
profile = db.get_profile()
styles = db.list_styles()
style_desc = {s["name"]: s.get("description") or "" for s in styles}

tagged = [i for i in items if not ai.is_untagged(i)]
untagged_n = len(items) - len(tagged)

if len(tagged) < 4:
    st.info(f"There aren't enough described pieces yet ({len(tagged)} of {len(items)}). "
            "Outfits need each item's type, colors and style.", icon=":material/info:")
    if untagged_n:
        st.page_link("views/closet.py", label=f"Describe my {untagged_n} undescribed items",
                     icon=":material/auto_awesome:")
    else:
        st.page_link("views/add.py", label="Add more clothes", icon=":material/add_a_photo:")
    st.stop()

if untagged_n:
    st.caption(f"Using {len(tagged)} described pieces. {untagged_n} more will be included once they're "
               "described (Closet → Describe them now).")

# ------------------------------------------------------------------ choices
mine = [s for s in (profile.get("my_styles") or []) if s in style_desc]
others = [s for s in style_desc if s not in mine]
options = mine + others
style = st.pills("Style", options, default=options[0] if options else None,
                 help="Your favorite styles are listed first.")
with st.expander("Occasion & weather (optional)"):
    occasion = st.text_input("What's the occasion?", placeholder="e.g. lunch with friends, lake weekend, church")
    season = st.segmented_control("Season / weather", ["Spring", "Summer", "Fall", "Winter", "Chilly", "Hot"])
    count = st.slider("How many outfits", 2, 6, 4)

go = st.button("Find outfits", type="primary", use_container_width=True, icon=":material/auto_awesome:",
               disabled=not style)

if go:
    with st.spinner("Putting looks together from your closet…"):
        try:
            st.session_state.outfits = ai.suggest_outfits(
                tagged, profile, style, style_desc.get(style, ""), occasion, (season or "").lower(), count)
            st.session_state.outfits_for = style
        except Exception as e:
            st.session_state.outfits = None
            st.error(ai.friendly_error(e), icon=":material/error:")

# ------------------------------------------------------------------ results
result = st.session_state.get("outfits")
if result:
    st.subheader(st.session_state.get("outfits_for", ""))
    if not result["outfits"]:
        st.info("Your closet doesn't have enough for this style yet.")
    paths = tuple(i.get("thumb_path") for o in result["outfits"] for i in o["items"])
    urls = db.signed_urls(paths)
    for n, o in enumerate(result["outfits"]):
        with st.container(border=True):
            st.markdown(f"**{html.escape(o['title'])}**")
            with st.container(key=f"grid_outfit_{n}"):
                pieces = o["items"]
                cols_n = min(max(len(pieces), 3), 4)
                for row in ui.rows(pieces, cols_n):
                    cols = st.columns(cols_n)
                    for col, it in zip(cols, row):
                        with col:
                            if it.get("thumb_path") in urls:
                                st.image(urls[it["thumb_path"]])
                            ui.caption(it.get("name"))
            if o.get("why"):
                st.write(o["why"])
            if o.get("tip"):
                st.caption(f"💡 {o['tip']}")
            if o.get("add_piece"):
                st.caption(f"🛍️ Would be even better with: {o['add_piece']}")
            if st.button("I'm wearing this today", key=f"wear_{n}", use_container_width=True):
                for it in pieces:
                    it["times_worn"] = (it.get("times_worn") or 0) + 1
                    db.update_item(it["id"], {"times_worn": it["times_worn"]})
                st.toast("Logged — enjoy!", icon=":material/check:")
    if result.get("closet_gaps"):
        st.markdown("**Pieces that would open up more outfits in this style**")
        ui.chips(result["closet_gaps"])
