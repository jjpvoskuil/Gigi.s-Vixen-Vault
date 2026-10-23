"""Simple single-user password gate.

After a successful login a signed token is put in the page address (?k=...),
so a home-screen shortcut saved *after* logging in keeps her signed in.
"""
import hashlib
import hmac

import streamlit as st

from lib import config


def _token():
    pw = config.app_password() or ""
    return hmac.new(pw.encode(), b"vixen-vault-v1", hashlib.sha256).hexdigest()[:32]


def is_logged_in():
    if st.session_state.get("authed"):
        return True
    k = st.query_params.get("k")
    if k and hmac.compare_digest(k, _token()):
        st.session_state["authed"] = True
        return True
    return False


def login_screen():
    st.markdown(
        "<div class='vv-hero'><div class='vv-title'>Gigi's Vixen Vault</div>"
        "<div class='vv-sub'>Your closet, your style.</div></div>",
        unsafe_allow_html=True,
    )
    with st.form("login", border=False):
        pw = st.text_input("Password", type="password")
        ok = st.form_submit_button("Open the Vault", type="primary", use_container_width=True)
    if ok:
        if hmac.compare_digest(pw, config.app_password() or ""):
            st.session_state["authed"] = True
            st.query_params["k"] = _token()
            st.rerun()
        else:
            st.error("That's not it — try again.")


def logout():
    st.session_state.pop("authed", None)
    st.query_params.clear()
    st.rerun()
