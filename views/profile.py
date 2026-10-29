import streamlit as st

from lib import db, images, ui

st.title("Me")

profile = db.get_profile()
tab_m, tab_p, tab_s = st.tabs(["Measurements", "Photos", "Styles"])

# (key, label, help) — all in inches
MEASUREMENTS = [
    ("bust", "Bust", "Around the fullest part, tape level across your back"),
    ("underbust", "Underbust", "Snug around your ribcage, right under the bust"),
    ("waist", "Waist", "Around the narrowest part, usually just above the belly button"),
    ("high_hip", "High hip", "Around the top of the hip bones, a few inches below the waist"),
    ("hips", "Hips", "Around the fullest part of your seat, feet together"),
    ("shoulders", "Shoulder width", "Across your back from one shoulder point to the other"),
    ("torso", "Torso length", "From the top of the shoulder, over the bust, down to the waist"),
    ("arm", "Arm length", "From shoulder point to wrist bone, arm slightly bent"),
    ("inseam", "Inseam", "Crotch to ankle along the inside leg (or measure jeans that fit)"),
    ("thigh", "Thigh", "Around the fullest part of one thigh"),
]
SIZES = [
    ("tops", "Tops", "e.g. M or 8"),
    ("bottoms", "Pants / jeans", "e.g. 8 or 29"),
    ("dresses", "Dresses", "e.g. 8"),
    ("bra", "Bra", "e.g. 34C"),
    ("shoes", "Shoes", "e.g. 8.5"),
]

# ------------------------------------------------------------------ measurements
with tab_m:
    m = dict(profile.get("measurements") or {})
    s = dict(profile.get("sizes") or {})
    st.caption("Inches. Use a soft tape, snug but not tight, over light clothing. "
               "Leave anything blank you don't know yet.")
    with st.form("measurements", border=False):
        c1, c2, c3 = st.columns(3)
        h_total = m.get("height")
        h_ft = c1.number_input("Height (ft)", 4, 7, int(h_total // 12) if h_total else 5, step=1)
        h_in = c2.number_input("(in)", 0.0, 11.75, float(h_total % 12) if h_total else 4.0, step=0.25)
        weight = c3.number_input("Weight (lb)", 0, 400, int(m["weight"]) if m.get("weight") else None, step=1,
                                 help="Optional")
        vals = {}
        for row in ui.rows(MEASUREMENTS, 2):
            cols = st.columns(2)
            for col, (key, label, hlp) in zip(cols, row):
                vals[key] = col.number_input(label, 0.0, 80.0, float(m[key]) if m.get(key) else None,
                                               step=0.25, help=hlp)
        st.markdown("**Usual sizes**")
        svals = {}
        for row in ui.rows(SIZES, 3):
            cols = st.columns(3)
            for col, (key, label, ph) in zip(cols, row):
                svals[key] = col.text_input(label, s.get(key, ""), placeholder=ph)
        fit_notes = st.text_area(
            "What I like to show off / play down", profile.get("fit_notes") or "",
            placeholder="e.g. love my waist and legs, prefer to skim over my tummy, don't like cropped tops")
        color_notes = st.text_area(
            "Colors I love / avoid", profile.get("color_notes") or "",
            placeholder="e.g. love jewel tones and navy, avoid mustard and neon")
        saved = st.form_submit_button("Save", type="primary", use_container_width=True)
    if saved:
        new_m = {k: v for k, v in vals.items() if v}
        new_m["height"] = h_ft * 12 + h_in
        if weight:
            new_m["weight"] = weight
        db.save_profile({
            "measurements": new_m,
            "sizes": {k: v.strip() for k, v in svals.items() if v.strip()},
            "fit_notes": fit_notes,
            "color_notes": color_notes,
        })
        st.toast("Saved", icon=":material/check:")
        st.rerun()

# ------------------------------------------------------------------ body photos
with tab_p:
    st.caption("These are used later to show outfits on you. They're stored privately — "
               "only this app can see them.")
    with st.expander("How to take them", icon=":material/lightbulb:"):
        st.markdown(
            "- Full length, head to toe, standing straight, arms slightly away from your body.\n"
            "- Wear fitted clothes (leggings and a fitted tee, or similar).\n"
            "- Plain background, good even light, phone held at about waist height.\n"
            "- At minimum one **Front** photo; **Side** and **Back** help too."
        )
    st.session_state.setdefault("body_key", 0)
    VIEWS = ["Front", "Side", "Back", "Other"]
    ups = st.file_uploader("Take or choose photos (you can pick several)",
                           type=["jpg", "jpeg", "png", "webp", "heic", "heif"],
                           accept_multiple_files=True, key=f"body_{st.session_state.body_key}")

    if ups:
        st.markdown(f"**Check {'this photo' if len(ups) == 1 else f'these {len(ups)} photos'} before saving**")
        picks = []
        with st.container(key="grid_body_new"):
            for row in ui.rows(list(enumerate(ups)), 3):
                cols = st.columns(3)
                for col, (n, f) in zip(cols, row):
                    with col:
                        try:
                            st.image(images.to_jpeg(images.open_image(f.getvalue()), images.THUMB_SIZE))
                        except Exception:
                            st.caption("Can't preview")
                        lab = st.selectbox("View", VIEWS, index=min(n, 3), key=f"lab_{st.session_state.body_key}_{n}",
                                           label_visibility="collapsed")
                        keep = st.checkbox("Keep", True, key=f"keep_{st.session_state.body_key}_{n}")
                        picks.append((f, lab, keep))
        chosen = [(f, lab) for f, lab, keep in picks if keep]
        c1, c2 = st.columns([2, 1])
        if c1.button(f"Save {len(chosen)} photo{'s' if len(chosen) != 1 else ''}", type="primary",
                     use_container_width=True, disabled=not chosen):
            bar = st.progress(0.0, text="Saving…")
            for n, (f, lab) in enumerate(chosen, start=1):
                pics = images.prepare(f.getvalue())
                image_path, thumb_path = db.upload_photo("body", pics["full"], pics["thumb"])
                db.add_body_photo(lab, image_path, thumb_path)
                bar.progress(n / len(chosen), text=f"Saved {n} of {len(chosen)}")
            st.session_state.body_key += 1
            st.session_state.body_saved = len(chosen)
            st.rerun()
        if c2.button("Start over", use_container_width=True):
            st.session_state.body_key += 1
            st.rerun()

    if st.session_state.pop("body_saved", 0):
        st.success("Saved! They're below. Add more any time.", icon=":material/check:")

    @st.dialog("Body photo", width="large")
    def view_body(p):
        big = db.signed_urls((p.get("image_path"),))
        if p.get("image_path") in big:
            st.image(big[p["image_path"]])
        new_label = st.segmented_control("View", VIEWS, default=p.get("label") if p.get("label") in VIEWS else "Other",
                                         key=f"relabel_{p['id']}")
        c1, c2 = st.columns(2)
        if c1.button("Save label", use_container_width=True, disabled=new_label == p.get("label")):
            db.update_body_photo(p["id"], new_label)
            st.rerun()
        with c2.popover("Delete", use_container_width=True):
            st.write("Delete this photo for good?")
            if st.button("Yes, delete", type="primary", key=f"delbody_{p['id']}"):
                db.delete_body_photo(p)
                st.rerun()

    photos = db.list_body_photos()
    st.markdown(f"**Saved photos ({len(photos)})**")
    if not photos:
        st.caption("None yet — take a Front photo to start.")
    else:
        urls = db.signed_urls(tuple(p.get("thumb_path") for p in photos))
        with st.container(key="grid_body"):
            for row in ui.rows(photos, 3):
                cols = st.columns(3)
                for col, p in zip(cols, row):
                    with col:
                        if p.get("thumb_path") in urls:
                            st.image(urls[p["thumb_path"]])
                        else:
                            st.caption("Photo unavailable")
                        ui.caption(p.get("label"))
                        if st.button("View", key=f"viewbody_{p['id']}", use_container_width=True):
                            view_body(p)

# ------------------------------------------------------------------ styles
with tab_s:
    styles = db.list_styles()
    names = [x["name"] for x in styles]
    current = [x for x in (profile.get("my_styles") or []) if x in names]
    st.caption("Tap the styles you love. Outfit suggestions will lean on these.")
    picked = st.pills("My styles", names, selection_mode="multi", default=current,
                      label_visibility="collapsed")
    if sorted(picked or []) != sorted(current):
        if st.button("Save my styles", type="primary", use_container_width=True):
            db.save_profile({"my_styles": picked or []})
            st.toast("Saved", icon=":material/check:")
            st.rerun()

    with st.expander("What each style means"):
        for x in styles:
            st.markdown(f"**{x['name']}** — {x.get('description') or ''}")

    with st.expander("Add a style of my own"):
        with st.form("new_style", border=False, clear_on_submit=True):
            n = st.text_input("Style name", placeholder="e.g. Rodeo Glam")
            d = st.text_input("What it means to you", placeholder="e.g. Western with sparkle")
            if st.form_submit_button("Add style") and n.strip():
                db.add_style(n, d)
                st.rerun()
        custom = [x["name"] for x in styles if x.get("custom")]
        if custom:
            gone = st.selectbox("Remove one of my styles", [""] + custom)
            if gone and st.button(f"Remove “{gone}”"):
                db.delete_style(gone)
                st.rerun()
