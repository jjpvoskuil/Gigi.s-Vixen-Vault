import html

import streamlit as st

from lib import images, punchlist as pl

st.title("Punch list")
st.caption("Bugs, changes and ideas for the app. Claude reads this list when working on the next update "
           "and marks items done with a note.")

if not pl.enabled():
    st.warning(
        "The punch list needs a GitHub key to save. In Streamlit Cloud open this app → "
        "**Settings → Secrets** and add:\n\n"
        "```toml\n[github]\ntoken = \"github_pat_...\"\n```\n"
        "Use a fine-grained token for just this repo with **Contents: Read and write**."
    )
    st.stop()

st.session_state.setdefault("pl_key", 0)
k = st.session_state.pl_key

# ------------------------------------------------------------------ add
items = pl.load()
PRIO = {p: n for n, p in enumerate(pl.PRIORITIES)}
open_items = sorted([i for i in items if i.get("status") in ("Open", "In progress")],
                    key=lambda i: (PRIO.get(i.get("priority"), 1), i.get("created", "")))
closed = sorted([i for i in items if i.get("status") not in ("Open", "In progress")],
                key=lambda i: i.get("updated", ""), reverse=True)

with st.expander("Add an item", expanded=not open_items, icon=":material/add_task:"):
    title = st.text_input("What should change?", key=f"pl_title_{k}",
                          placeholder="e.g. Photos don't show after I take them")
    details = st.text_area("Details (optional)", key=f"pl_details_{k}", height=90,
                           placeholder="What you did, what you expected, what happened instead")
    c1, c2 = st.columns(2)
    kind = c1.selectbox("Type", pl.TYPES, key=f"pl_type_{k}")
    page = c2.selectbox("Where in the app", pl.PAGES, key=f"pl_page_{k}")
    c1, c2 = st.columns(2)
    prio = c1.segmented_control("Priority", pl.PRIORITIES, default="Normal", key=f"pl_prio_{k}")
    who = c2.segmented_control("From", ["Gigi", "John"], default="Gigi", key=f"pl_who_{k}")
    shot = st.file_uploader("Screenshot (optional)", type=["jpg", "jpeg", "png", "webp", "heic", "heif"],
                            key=f"pl_shot_{k}")
    if st.button("Add to punch list", type="primary", use_container_width=True, disabled=not title.strip()):
        with st.spinner("Saving…"):
            shot_bytes = None
            if shot:
                shot_bytes = images.to_jpeg(images.open_image(shot.getvalue()), 1400, 85)
            pl.add({"title": title, "details": details, "type": kind, "page": page,
                    "priority": prio or "Normal", "added_by": who or ""}, shot_bytes)
        st.session_state.pl_key += 1
        st.toast("Added", icon=":material/check:")
        st.rerun()

# ------------------------------------------------------------------ list
ICON = {"Bug": "🐞", "Change": "✏️", "New idea": "💡", "Question": "❓"}


@st.dialog("Edit item")
def edit_item(item):
    with st.form(f"edit_{item['id']}", border=False):
        title = st.text_input("What should change?", item.get("title", ""))
        details = st.text_area("Details", item.get("details", ""), height=110)
        c1, c2 = st.columns(2)
        kind = c1.selectbox("Type", pl.TYPES, index=pl.TYPES.index(item["type"]) if item.get("type") in pl.TYPES else 0)
        page = c2.selectbox("Where in the app", pl.PAGES,
                            index=pl.PAGES.index(item["page"]) if item.get("page") in pl.PAGES else len(pl.PAGES) - 1)
        prio = st.segmented_control("Priority", pl.PRIORITIES, default=item.get("priority") or "Normal")
        shot = st.file_uploader("Add a screenshot", type=["jpg", "jpeg", "png", "webp", "heic", "heif"])
        save = st.form_submit_button("Save changes", type="primary", use_container_width=True)
    if save and title.strip():
        with st.spinner("Saving…"):
            shot_bytes = images.to_jpeg(images.open_image(shot.getvalue()), 1400, 85) if shot else None
            pl.edit(item["id"], {"title": title.strip(), "details": details.strip(), "type": kind,
                                 "page": page, "priority": prio or "Normal"}, shot_bytes)
        st.rerun()


def show(item):
    badge = "🔺 " if item.get("priority") == "High" else ""
    status = "" if item.get("status") == "Open" else f" · {item.get('status')}"
    with st.expander(f"{badge}{ICON.get(item.get('type'), '•')} {item.get('title')}{status}"):
        st.caption(f"{item.get('type')} · {item.get('page')} · {item.get('priority')} priority"
                   f"{' · from ' + item['added_by'] if item.get('added_by') else ''} · {item.get('created', '')[:10]}")
        if item.get("details"):
            st.write(item["details"])
        for path in pl.all_screenshots(item):
            try:
                st.image(pl.screenshot(path))
            except Exception:
                st.caption("(screenshot couldn't be loaded)")
        for c in item.get("comments") or []:
            st.markdown(f"<div class='vv-note'><b>{html.escape(c.get('by') or '')}</b> "
                        f"<span>{html.escape((c.get('at') or '')[:10])}</span><br>{html.escape(c.get('text', ''))}</div>",
                        unsafe_allow_html=True)
        if item.get("dev_notes"):
            st.info(item["dev_notes"], icon=":material/code:")

        # follow-up note + picture without opening the full editor
        nk = f"note_{item['id']}_{st.session_state.pl_key}"
        note = st.text_area("Add more info", key=nk, height=68, placeholder="Anything to add?",
                            label_visibility="collapsed")
        c1, c2 = st.columns([1, 1])
        who = c1.segmented_control("From", ["Gigi", "John"], default="Gigi", key=f"who_{nk}",
                                   label_visibility="collapsed")
        if c2.button("Add note", key=f"addnote_{item['id']}", use_container_width=True, disabled=not note.strip()):
            pl.edit(item["id"], {}, comment={"by": who or "", "text": note})
            st.session_state.pl_key += 1
            st.rerun()

        c1, c2, c3 = st.columns([3, 2, 2])
        new_status = c1.selectbox("Status", pl.STATUSES, index=pl.STATUSES.index(item.get("status", "Open"))
                                  if item.get("status") in pl.STATUSES else 0, key=f"st_{item['id']}",
                                  label_visibility="collapsed")
        if new_status != item.get("status"):
            pl.update(item["id"], {"status": new_status})
            st.rerun()
        if c2.button("Edit", key=f"edit_{item['id']}", icon=":material/edit:", use_container_width=True):
            edit_item(item)
        with c3.popover("Delete", use_container_width=True):
            if st.button("Delete item", type="primary", key=f"del_{item['id']}"):
                pl.delete(item["id"])
                st.rerun()


st.subheader(f"To do ({len(open_items)})")
if not open_items:
    st.caption("Nothing open. 🎉")
for it in open_items:
    show(it)

if closed and st.toggle(f"Show finished ({len(closed)})"):
    for it in closed:
        show(it)

if st.button("Refresh", type="tertiary", icon=":material/refresh:"):
    pl.load.clear()
    st.rerun()
