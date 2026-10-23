"""Shared look-and-feel, tuned for a phone screen."""
import html

import streamlit as st

CSS = """
<style>
/* tighter phone margins */
.block-container {padding-top: 2.2rem; padding-left: 1rem; padding-right: 1rem; max-width: 760px;}
h1, h2, h3 {letter-spacing: -0.01em;}

.vv-hero {text-align:center; margin: 1.5rem 0 1.25rem;}
.vv-title {font-family: Georgia, 'Times New Roman', serif; font-size: 2.1rem; font-weight: 700; color: #A8325E;}
.vv-sub {color: #7a5d69; font-size: 1rem; margin-top: .2rem;}

/* keep photo grids side-by-side on phones instead of stacking */
[class*="st-key-grid"] div[data-testid="stHorizontalBlock"] {flex-wrap: nowrap !important; gap: .5rem !important;}
[class*="st-key-grid"] div[data-testid="stColumn"] {min-width: 0 !important; flex: 1 1 0 !important; width: auto !important;}
[class*="st-key-grid"] img {border-radius: 10px; aspect-ratio: 3 / 4; object-fit: cover; width: 100%; background:#f3e6ea;}
[class*="st-key-grid"] button {padding: .15rem .4rem; min-height: 1.9rem; font-size: .8rem;}

.vv-cap {font-size: .78rem; line-height: 1.15; color: #4a3640; margin: .2rem 0 .1rem;
         overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; min-height: 1.8rem;}
.vv-chip {display:inline-block; background:#F7E9EC; color:#7d2448; border-radius: 999px;
          padding: .1rem .55rem; margin: 0 .25rem .25rem 0; font-size: .78rem;}
.vv-stat {background:#F7E9EC; border-radius: 14px; padding: .8rem; text-align:center;}
.vv-stat b {display:block; font-size: 1.6rem; color:#A8325E;}
</style>
"""


def apply():
    st.markdown(CSS, unsafe_allow_html=True)


def caption(text):
    st.markdown(f"<div class='vv-cap'>{html.escape(text or '')}</div>", unsafe_allow_html=True)


def chips(values):
    vals = [v for v in (values or []) if v]
    if vals:
        st.markdown("".join(f"<span class='vv-chip'>{html.escape(str(v))}</span>" for v in vals),
                    unsafe_allow_html=True)


def stat(label, value):
    st.markdown(f"<div class='vv-stat'><b>{html.escape(str(value))}</b>{html.escape(label)}</div>",
                unsafe_allow_html=True)


def rows(seq, n):
    """Split a list into rows of n."""
    for i in range(0, len(seq), n):
        yield seq[i:i + n]
