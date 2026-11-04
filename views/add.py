import streamlit as st

from lib import ai, config, db, images, ui

st.title("Add clothes")

with st.expander("Tips for great photos", icon=":material/lightbulb:"):
    st.markdown(
        "- Tap the upload area, then choose **Camera** to use your phone's full-quality camera.\n"
        "- Lay the piece flat or hang it against a plain wall or door.\n"
        "- Good light (daylight is best), no flash glare, whole item in frame.\n"
        "- One item per photo. You can pick several photos at once from your gallery."
    )

st.session_state.setdefault("upload_key", 0)
st.session_state.setdefault("just_added", [])

files = st.file_uploader(
    "Take or choose photos",
    type=["jpg", "jpeg", "png", "webp", "heic", "heif"],
    accept_multiple_files=True,
    key=f"uploader_{st.session_state.upload_key}",
)

if not config.ai_enabled():
    st.caption("AI tagging is off (no ANTHROPIC_API_KEY in settings) — items will be added "
               "untagged and you can fill in details in the Closet.")

if files:
    label = f"Add {len(files)} item{'s' if len(files) != 1 else ''} to my closet"
    if st.button(label, type="primary", use_container_width=True):
        style_names = [s["name"] for s in db.list_styles()]
        added, failed, untagged = [], [], []
        bar = st.progress(0.0, text="Starting…")
        for n, f in enumerate(files, start=1):
            bar.progress((n - 1) / len(files), text=f"Working on {n} of {len(files)}…")
            try:
                pics = images.prepare(f.getvalue())
                fields = {"name": "New item", "category": "other"}
                if config.ai_enabled():
                    try:
                        fields = ai.tag_item(pics["ai"], style_names)
                    except Exception as e:  # keep going; it can be described later from the Closet
                        untagged.append(ai.friendly_error(e))
                image_path, thumb_path = db.upload_photo("items", pics["full"], pics["thumb"])
                fields.update(image_path=image_path, thumb_path=thumb_path)
                row = db.add_item(fields)
                if row:
                    added.append(row)
            except Exception as e:
                failed.append(f"{f.name}: {e}")
        bar.progress(1.0, text="Done")
        st.session_state.just_added = added
        st.session_state.add_failed = failed
        st.session_state.add_untagged = untagged
        st.session_state.upload_key += 1  # clears the uploader
        db.signed_urls.clear()
        st.rerun()

added = st.session_state.get("just_added") or []
failed = st.session_state.get("add_failed") or []
if added:
    st.success(f"Added {len(added)} to your closet. Tap **Closet** to review or edit the details.")
    urls = db.signed_urls(tuple(a.get("thumb_path") for a in added))
    with st.container(key="grid_added"):
        for row in ui.rows(added, 3):
            cols = st.columns(3)
            for col, item in zip(cols, row):
                with col:
                    if item.get("thumb_path") in urls:
                        st.image(urls[item["thumb_path"]])
                    ui.caption(item.get("name"))
for msg in failed:
    st.error(f"Couldn't add {msg}")
untagged = st.session_state.get("add_untagged") or []
if untagged:
    st.warning(f"{len(untagged)} of these were saved but couldn't be described by the AI: **{untagged[0]}**  \n"
               "Once that's sorted, use **Describe them now** at the top of the Closet.",
               icon=":material/warning:")
