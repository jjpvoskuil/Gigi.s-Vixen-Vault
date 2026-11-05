import streamlit as st

from lib import ai, config, db, retag, ui

st.title("My closet")

items = db.list_items()
if not items:
    st.info("Your closet is empty so far.")
    st.page_link("views/add.py", label="Add your first pieces", icon=":material/add_a_photo:")
    st.stop()

style_names = [s["name"] for s in db.list_styles()]

# ------------------------------------------------------------------ describe untagged items
st.session_state.setdefault("retag_skip", [])
untagged = [i for i in items if ai.is_untagged(i) and i.get("image_path")
            and i["id"] not in st.session_state.retag_skip]
if untagged and config.ai_enabled():
    with st.container(border=True):
        if st.session_state.get("retag_running"):
            done = st.session_state.get("retag_done", 0)
            total = done + len(untagged)
            st.progress(done / total if total else 1.0,
                        text=f"Describing your clothes… {done} of {total} done. Keep this screen open.")
            if st.button("Pause", icon=":material/pause:"):
                st.session_state.retag_running = False
                st.rerun()
            ok, errs = retag.run_batch(untagged, style_names)
            st.session_state.retag_done = done + ok
            st.session_state.retag_skip += [i for i, _ in errs]
            if errs:
                st.session_state.retag_error = errs[0][1]
            if ok == 0 and errs:  # nothing worked — stop instead of looping
                st.session_state.retag_running = False
            st.rerun()
        else:
            st.markdown(f"**{len(untagged)} item{'s still need' if len(untagged) != 1 else ' still needs'} a description** "
                        "(type, colors, styles). Outfit picks depend on these.")
            if st.session_state.get("retag_error"):
                st.error(st.session_state.retag_error, icon=":material/error:")
            st.caption(f"Takes roughly {max(1, round(len(untagged) * 2.5 / 60))} min and costs about "
                       f"${len(untagged) * 0.01:.2f} in AI usage. You can pause any time; finished items are saved.")
            if st.button("Describe them now", type="primary", use_container_width=True,
                         icon=":material/auto_awesome:"):
                st.session_state.retag_running = True
                st.session_state.retag_done = 0
                st.session_state.retag_error = None
                st.rerun()
elif st.session_state.get("retag_running"):
    st.session_state.retag_running = False
    st.success(f"All done — described {st.session_state.get('retag_done', 0)} items.",
               icon=":material/check:")
elif st.session_state.retag_skip and st.session_state.get("retag_error"):
    st.warning(f"{len(st.session_state.retag_skip)} items couldn't be described: "
               f"{st.session_state.retag_error}", icon=":material/warning:")
    if st.button("Try those again"):
        st.session_state.retag_skip = []
        st.session_state.retag_error = None
        st.rerun()


# ------------------------------------------------------------------ edit dialog
@st.dialog("Item details", width="large")
def edit_item(item):
    urls = db.signed_urls((item.get("image_path"),))
    if item.get("image_path") in urls:
        st.image(urls[item["image_path"]])
    with st.form(f"edit_{item['id']}", border=False):
        name = st.text_input("Name", item.get("name") or "")
        c1, c2 = st.columns(2)
        cats = ai.CATEGORIES
        category = c1.selectbox("Category", cats,
                                index=cats.index(item["category"]) if item.get("category") in cats else len(cats) - 1)
        subcategory = c2.text_input("Type", item.get("subcategory") or "", placeholder="e.g. blouse, jeans")
        c1, c2 = st.columns(2)
        primary_color = c1.text_input("Main color", item.get("primary_color") or "")
        pattern = c2.text_input("Pattern", item.get("pattern") or "")
        colors = st.text_input("All colors (comma separated)", ", ".join(item.get("colors") or []))
        c1, c2 = st.columns(2)
        material = c1.text_input("Material", item.get("material") or "")
        fit = c2.text_input("Fit", item.get("fit") or "")
        form = ai.FORMALITY
        formality = st.select_slider("Dressiness", form,
                                     value=item["formality"] if item.get("formality") in form else "casual")
        seasons = st.multiselect("Seasons", ai.SEASONS,
                                 default=[s for s in (item.get("seasons") or []) if s in ai.SEASONS])
        styles = st.multiselect("Styles it suits", style_names,
                                default=[s for s in (item.get("styles") or []) if s in style_names])
        c1, c2 = st.columns(2)
        brand = c1.text_input("Brand", item.get("brand") or "")
        size = c2.text_input("Size", item.get("size") or "")
        description = st.text_area("Description", item.get("description") or "", height=80)
        notes = st.text_area("My notes", item.get("notes") or "", height=68,
                             placeholder="e.g. runs small, needs a cami underneath")
        favorite = st.toggle("Favorite", bool(item.get("favorite")))
        save = st.form_submit_button("Save", type="primary", use_container_width=True)
    if save:
        db.update_item(item["id"], dict(
            name=name, category=category, subcategory=subcategory, primary_color=primary_color,
            pattern=pattern, colors=[c.strip() for c in colors.split(",") if c.strip()],
            material=material, fit=fit, formality=formality, seasons=seasons, styles=styles,
            brand=brand, size=size, description=description, notes=notes, favorite=favorite,
        ))
        st.rerun()

    if config.ai_enabled() and item.get("image_path"):
        if st.button("Describe with AI", icon=":material/auto_awesome:", use_container_width=True,
                     help="Replaces the name, type, colors and styles with a fresh AI description. "
                          "Your notes, brand and size are kept."):
            with st.spinner("Looking at the photo…"):
                ok, errs = retag.run_batch([item], style_names)
            if errs:
                st.error(errs[0][1])
            else:
                st.rerun()

    st.divider()
    c1, c2 = st.columns(2)
    if c1.button(f"Wore it today ({item.get('times_worn') or 0})", use_container_width=True):
        db.update_item(item["id"], {"times_worn": (item.get("times_worn") or 0) + 1})
        st.rerun()
    with c2.popover("Delete", use_container_width=True):
        st.write("Remove this item and its photo for good?")
        if st.button("Yes, delete it", type="primary"):
            db.delete_item(item)
            st.rerun()


# ------------------------------------------------------------------ filters
q = st.text_input("Search", placeholder="Search: denim, red, sweater…", label_visibility="collapsed")
present = sorted({i.get("category") or "other" for i in items}, key=lambda c: ai.CATEGORIES.index(c)
                 if c in ai.CATEGORIES else 99)
cats = st.pills("Category", present, selection_mode="multi", label_visibility="collapsed")

with st.expander("More filters"):
    f_styles = st.multiselect("Style", style_names)
    f_seasons = st.multiselect("Season", ai.SEASONS)
    f_fav = st.toggle("Favorites only")
    sort = st.radio("Sort", ["Newest", "Category", "Color", "Most worn", "Least worn"], horizontal=True)


def matches(i):
    if cats and (i.get("category") or "other") not in cats:
        return False
    if f_fav and not i.get("favorite"):
        return False
    if f_styles and not set(f_styles) & set(i.get("styles") or []):
        return False
    if f_seasons and not set(f_seasons) & set(i.get("seasons") or []):
        return False
    if q:
        hay = " ".join(str(i.get(k) or "") for k in
                       ["name", "category", "subcategory", "primary_color", "pattern", "material",
                        "fit", "description", "brand", "notes"])
        hay += " " + " ".join((i.get("colors") or []) + (i.get("styles") or []))
        return all(word in hay.lower() for word in q.lower().split())
    return True


shown = [i for i in items if matches(i)]
if sort == "Category":
    shown.sort(key=lambda i: (i.get("category") or "", i.get("subcategory") or ""))
elif sort == "Color":
    shown.sort(key=lambda i: (i.get("primary_color") or "").lower())
elif sort == "Most worn":
    shown.sort(key=lambda i: -(i.get("times_worn") or 0))
elif sort == "Least worn":
    shown.sort(key=lambda i: i.get("times_worn") or 0)

st.caption(f"{len(shown)} of {len(items)} pieces")

# ------------------------------------------------------------------ grid
urls = db.signed_urls(tuple(i.get("thumb_path") for i in shown))
with st.container(key="grid_closet"):
    for row in ui.rows(shown, 3):
        cols = st.columns(3)
        for col, item in zip(cols, row):
            with col:
                if item.get("thumb_path") in urls:
                    st.image(urls[item["thumb_path"]])
                ui.caption(("♥ " if item.get("favorite") else "") + (item.get("name") or ""))
                if st.button("Open", key=f"open_{item['id']}", use_container_width=True):
                    edit_item(item)
