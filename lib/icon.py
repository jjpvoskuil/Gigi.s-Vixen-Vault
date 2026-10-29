"""Puts the fox icon on the *outer* page so "Add to Home Screen" picks it up.

On Streamlit Community Cloud the app runs in an iframe inside an outer page served from the
same address. Phones read the home-screen icon/name from that outer page, so we add the tags
there (window.top). The icon files are served by the public launcher site.
"""
import streamlit as st
import streamlit.components.v1 as components

from lib import config

_INJECT = """
<script>
(function () {
  var BASE = %(base)r;
  try {
    var d = window.top.document;
    var head = d.head;
    function upsert(sel, tag, attrs) {
      var el = head.querySelector(sel);
      if (!el) { el = d.createElement(tag); head.appendChild(el); }
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      el.setAttribute("data-vixen", "1");
      return el;
    }
    // iPhone / iPad
    head.querySelectorAll('link[rel="apple-touch-icon"]:not([data-vixen])').forEach(function (e) { e.remove(); });
    upsert('link[rel="apple-touch-icon"]', "link", {rel: "apple-touch-icon", sizes: "180x180", href: BASE + "apple-touch-icon.png"});
    upsert('meta[name="apple-mobile-web-app-title"]', "meta", {name: "apple-mobile-web-app-title", content: "Vixen Vault"});
    upsert('meta[name="apple-mobile-web-app-capable"]', "meta", {name: "apple-mobile-web-app-capable", content: "yes"});
    // Browser tab / Android
    head.querySelectorAll('link[rel~="icon"]:not([data-vixen])').forEach(function (e) { e.remove(); });
    upsert('link[rel~="icon"]', "link", {rel: "icon", type: "image/png", sizes: "192x192", href: BASE + "icon-192.png"});
    upsert('link[rel="manifest"]', "link", {rel: "manifest", href: BASE + "app.webmanifest"});
    upsert('meta[name="theme-color"]', "meta", {name: "theme-color", content: "#7A1F47"});
  } catch (e) { /* outer page not reachable (e.g. local dev) — nothing to do */ }
})();
</script>
"""

_CHECK = """
<div id="r" style="font:14px system-ui,sans-serif;color:#4a3640"></div>
<script>
(function () {
  var r = document.getElementById("r");
  try {
    var top = window.top.document;
    var el = top.head.querySelector('link[rel="apple-touch-icon"][data-vixen]');
    r.textContent = el ? "✅ Fox icon is set — Add to Home Screen from this page will use it."
                       : "⚠️ Fox icon not set on this page yet — reload and check again.";
  } catch (e) {
    r.textContent = "⚠️ Can't reach the outer page here — use the Set up phone icon button below.";
  }
})();
</script>
"""


def _base():
    base = config.launcher_url()
    return base if base.endswith("/") else base + "/"


def inject():
    """Call once per run, near the top of app.py."""
    with st.container(key="vv_icon_inject"):
        components.html(_INJECT % {"base": _base()}, height=0)


def status():
    components.html(_CHECK, height=48)
