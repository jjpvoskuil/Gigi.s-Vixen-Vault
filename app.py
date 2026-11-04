import streamlit as st

st.set_page_config(
    page_title="Gigi's Vixen Vault",
    page_icon="assets/icon-192.png",
    layout="centered",
    initial_sidebar_state="collapsed",
)

from lib import auth, config, icon, ui  # noqa: E402

ui.apply()
icon.inject()

missing = config.missing_settings()
if missing:
    st.markdown("<div class='vv-hero'><div class='vv-title'>Gigi's Vixen Vault</div>"
                "<div class='vv-sub'>Almost ready</div></div>", unsafe_allow_html=True)
    st.warning("The app's settings aren't filled in yet. In Streamlit Cloud open this app → "
               "**Settings → Secrets** and add: " + ", ".join(f"`{m}`" for m in missing) +
               ". See `.streamlit/secrets.toml.example` in the repo.")
    st.stop()

if not auth.is_logged_in():
    auth.login_screen()
    st.stop()

pages = [
    st.Page("views/home.py", title="Home", icon=":material/home:", default=True),
    st.Page("views/outfits.py", title="Outfits", icon=":material/styler:"),
    st.Page("views/add.py", title="Add", icon=":material/add_a_photo:"),
    st.Page("views/closet.py", title="Closet", icon=":material/checkroom:"),
    st.Page("views/profile.py", title="Me", icon=":material/person:"),
    st.Page("views/punchlist.py", title="Punch List", icon=":material/checklist:"),
]
st.navigation(pages, position="top").run()
