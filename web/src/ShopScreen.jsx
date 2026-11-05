// Shop the gaps: the AI looks at her closet + profile and suggests pieces/colors to buy that work with what she owns.
// Liked ideas go on a shared wish list (wishlist table) with a size-aware "Search online" link.
import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { Dial, Head } from "./Shell.jsx";
import { isUntagged } from "./lib/closet.js";
import { shopLink } from "./lib/ai.js";

const SEASONS = ["Spring", "Summer", "Fall", "Winter"];
const BUDGETS = [["", "Any"], ["budget", "Budget"], ["mid", "Mid-range"], ["splurge", "Splurge"]];
const NAMED = { oxblood: "#4A0A12", burgundy: "#800020", camel: "#C19A6B", cream: "#F3EBD3", mustard: "#E1AD01", emerald: "#1F8A5B",
  cobalt: "#0047AB", blush: "#E8B4B8", champagne: "#F7E7CE", taupe: "#8B7D70", rust: "#B7410E", sage: "#9CAF88", mauve: "#B784A7",
  nude: "#E3BC9A", "burnt orange": "#CC5500", charcoal: "#36454F", wine: "#722F37", cognac: "#9A463D", "jewel tones": "#5B2A86",
  "dusty rose": "#C9A0A0", "hunter green": "#355E3B", "forest green": "#228B22", denim: "#5B7FA6", "light wash": "#A8C1DC", oatmeal: "#E2D7C1" };

/** A CSS color for a color name, or null when we can't show it honestly. */
export function swatch(name) {
  const n = String(name || "").trim().toLowerCase();
  if (NAMED[n]) return NAMED[n];
  const css = n.replace(/\s+/g, "");
  return typeof CSS !== "undefined" && CSS.supports?.("color", css) ? css : null;
}

export default function ShopScreen({ db, items, styles, profile, result, setResult, onBack, onAdd, toast }) {
  const [tab, setTab] = useState("ideas");
  const mine = (profile.my_styles || []).filter((s) => styles.some((x) => x.name === s));
  const [style, setStyle] = useState(result?.opts?.style ?? "");
  const [season, setSeason] = useState(result?.opts?.season ?? "");
  const [budget, setBudget] = useState(result?.opts?.budget ?? "");
  const [allStyles, setAllStyles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wish, setWish] = useState(null);
  const [urls, setUrls] = useState({});
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const described = items.filter((i) => !isUntagged(i)).length;
  const styleOptions = allStyles ? styles.map((s) => s.name) : [...new Set([...mine, ...(style ? [style] : [])])];

  const loadWish = async () => { try { setWish(await db.listWish()); } catch (e) { setError(e.message); setWish([]); } };
  useEffect(() => { loadWish(); }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  // thumbnails for "goes with"
  useEffect(() => {
    const ids = [...(result?.suggestions || []).flatMap((s) => s.pairs_with), ...(wish || []).flatMap((w) => w.pairs_with || [])];
    const paths = [...new Set(ids)].map((id) => byId[id]?.thumb_path).filter(Boolean);
    if (paths.length) db.photoUrls(paths).then((u) => setUrls((o) => ({ ...o, ...u }))).catch(() => {});
  }, [result, wish, db]); // eslint-disable-line react-hooks/exhaustive-deps

  async function find() {
    setBusy(true); setError("");
    try {
      const styleDesc = styles.find((s) => s.name === style)?.description || "";
      const opts = { style, style_desc: styleDesc, season: season.toLowerCase(), budget, count: 6 };
      const r = await db.suggestShopping(opts);
      setResult({ ...r, opts: { style, season, budget } });
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  const onList = (piece) => (wish || []).some((w) => w.piece.toLowerCase() === piece.toLowerCase() && w.status !== "skip");
  async function addToList(s, source = "shop") {
    try { await db.addWish({ ...s, source }); await loadWish(); toast("Added to your list"); }
    catch (e) { toast(`Couldn't add — ${e.message}`); }
  }
  async function setStatus(w, status, ok) {
    try { await db.updateWish(w.id, { status }); await loadWish(); if (ok) toast(ok); } catch (e) { toast(e.message); }
  }
  async function remove(w) {
    try { await db.deleteWish(w.id); await loadWish(); toast("Removed"); } catch (e) { toast(e.message); }
  }

  const want = (wish || []).filter((w) => w.status === "want");
  const bought = (wish || []).filter((w) => w.status === "bought");
  const Pairs = ({ ids }) => ids?.length ? (
    <div className="pairs"><span>Goes with</span>
      {ids.map((id) => byId[id] && <img key={id} src={urls[byId[id].thumb_path] || undefined} alt={byId[id].name} title={byId[id].name} />)}
    </div>) : null;

  return (
    <div className="scroll">
      <Dial />
      <Head eyebrow="More" title="Shop the gaps" sub="What to add next — chosen to work with what you own">
        <button className="round" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
      </Head>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "ideas"} className={tab === "ideas" ? "on" : ""} onClick={() => setTab("ideas")}>Ideas</button>
        <button role="tab" aria-selected={tab === "list"} className={tab === "list" ? "on" : ""} onClick={() => setTab("list")}>
          My list<span className="n">{want.length}</span></button>
      </div>

      {tab === "ideas" && (described < 4
        ? <div className="pad"><div className="waitcard"><Icon name="sparkle" size={20} /><div><b>Describe at least 4 pieces first.</b>
            <span className="small">Suggestions are built around what's already in the vault.</span></div></div>
            <button className="btn primary wide" onClick={onAdd}>Go to Add</button></div>
        : <>
            <div className="pad">
              <div className="field"><span>Focus</span>
                <div className="pills">
                  <button className={`pill ${style === "" ? "on" : ""}`} onClick={() => setStyle("")}>All my styles</button>
                  {styleOptions.map((s) => <button key={s} className={`pill ${style === s ? "on" : ""}`} onClick={() => setStyle(s)}>{s}</button>)}
                  <button className="pill more" onClick={() => setAllStyles(!allStyles)}>{allStyles ? "Fewer" : "+ more styles"}</button>
                </div>
              </div>
              <div className="field"><span>Season (optional)</span>
                <div className="pills">{SEASONS.map((s) => <button key={s} className={`pill ${season === s ? "on" : ""}`} onClick={() => setSeason(season === s ? "" : s)}>{s}</button>)}</div>
              </div>
              <div className="field"><span>Budget</span>
                <div className="pills">{BUDGETS.map(([id, label]) => <button key={id} className={`pill ${budget === id ? "on" : ""}`} onClick={() => setBudget(id)}>{label}</button>)}</div>
              </div>
              <button className="btn primary wide" disabled={busy} onClick={find}>
                {busy ? <><span className="spin light" />Studying your closet…</> : <><Icon name="sparkle" size={18} />Find what's missing</>}
              </button>
              {busy && <p className="small muted center">This takes about 20–40 seconds.</p>}
              {error && <p className="qerr" style={{ marginTop: 10 }}>{error}</p>}
            </div>

            {result && !busy && <>
              {result.summary && <div className="leather shopsum"><div className="copy" style={{ maxWidth: "none" }}>
                <span className="kicker">Your closet</span><span className="note big2">{result.summary}</span></div></div>}

              {result.colors?.length > 0 && <>
                <h2 className="section">Colors to add</h2>
                <ul className="colors">{result.colors.map((c) => (
                  <li key={c.color}><i style={swatch(c.color) ? { background: swatch(c.color) } : undefined} className={swatch(c.color) ? "" : "unknown"} />
                    <span><b>{c.color}</b>{c.why}</span></li>))}
                </ul>
              </>}

              <h2 className="section">Pieces to look for</h2>
              <ul className="shoplist">
                {result.suggestions.map((s) => (
                  <li key={s.piece} className="idea">
                    <div className="ideahead">
                      <i className={`dot ${swatch(s.color) ? "" : "unknown"}`} style={swatch(s.color) ? { background: swatch(s.color) } : undefined} />
                      <h3>{s.piece}</h3>
                      <span className={`chip p-${s.priority.replace(/\W/g, "")}`}>{s.priority}</span>
                    </div>
                    <p>{s.why}</p>
                    <Pairs ids={s.pairs_with} />
                    {s.new_looks > 0 && <p className="unlocks">≈ {s.new_looks} new look{s.new_looks === 1 ? "" : "s"}</p>}
                    <div className="actions">
                      <a className="btn" href={shopLink(s.search, s.category, profile.sizes)} target="_blank" rel="noopener noreferrer"><Icon name="search" size={18} />Search online</a>
                      {onList(s.piece)
                        ? <button className="btn" disabled><Icon name="check" size={18} />On my list</button>
                        : <button className="btn dark" onClick={() => addToList(s)}><Icon name="heart" size={18} />Add to list</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </>}
          </>)}

      {tab === "list" && (
        <div>
          {wish === null && <p className="empty">Loading…</p>}
          {wish && want.length === 0 && <p className="empty">Nothing on the list yet. Add ideas from the Ideas tab, or tap a “would unlock more looks” piece on Unlock.</p>}
          <ul className="shoplist">
            {want.map((w) => (
              <li key={w.id} className="idea">
                <div className="ideahead">
                  <i className={`dot ${swatch(w.color) ? "" : "unknown"}`} style={swatch(w.color) ? { background: swatch(w.color) } : undefined} />
                  <h3>{w.piece}</h3>
                  <button className="round sm" aria-label={`Remove ${w.piece}`} onClick={() => remove(w)}><Icon name="close" size={16} /></button>
                </div>
                {w.why && <p>{w.why}</p>}
                <Pairs ids={w.pairs_with} />
                <div className="actions">
                  <a className="btn" href={shopLink(w.search || w.piece, w.category, profile.sizes)} target="_blank" rel="noopener noreferrer"><Icon name="search" size={18} />Search online</a>
                  <button className="btn primary" onClick={() => setStatus(w, "bought", "Nice! Add it to the vault when it arrives")}><Icon name="check" size={18} />Bought it</button>
                </div>
              </li>
            ))}
          </ul>
          {bought.length > 0 && <>
            <h2 className="section">Bought</h2>
            <ul className="punchlist">{bought.map((w) => (
              <li key={w.id}><div className="prow done">
                <span className="ptext"><span className="ptitle">{w.piece}</span><span className="pmeta">Add a photo of it so outfits can use it.</span></span>
                <button className="pill" onClick={onAdd}>Add photo</button>
                <button className="round sm" aria-label={`Remove ${w.piece}`} onClick={() => remove(w)}><Icon name="close" size={16} /></button>
              </div></li>))}
            </ul>
          </>}
        </div>
      )}
    </div>
  );
}
