// Unlock a look: pick a style (+ optional occasion / weather) → the AI builds outfits from her described pieces.
// Results live in App state, so switching tabs doesn't lose them.
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { Dial, Head, Sheet, Studs } from "./Shell.jsx";
import { CATEGORY_LABEL, isUntagged } from "./lib/closet.js";
import { ItemSheet } from "./ClosetScreen.jsx";
import { TryOnSheet } from "./TryOn.jsx";

const WEATHER = ["Spring", "Summer", "Fall", "Winter", "Chilly", "Hot"];
const COUNTS = [2, 3, 4, 6];
const MODES = [["style", "From a style"], ["build", "Build an outfit"]];

export default function UnlockScreen({ db, items, styles, profile, result, setResult, built, setBuilt, mode, setMode, onWore, onAdd, onSave, onDelete, onDescribe, onWish, onShop }) {
  const mine = (profile.my_styles || []).filter((s) => styles.some((x) => x.name === s));
  const options = [...mine, ...styles.map((s) => s.name).filter((s) => !mine.includes(s))];
  const [style, setStyle] = useState(result?.style || options[0] || "");
  const [occasion, setOccasion] = useState(result?.occasion || "");
  const [season, setSeason] = useState(result?.season || "");
  const [count, setCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [urls, setUrls] = useState({});
  const [worn, setWorn] = useState({});
  const [allStyles, setAllStyles] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [trying, setTrying] = useState(null); // the look being tried on
  const [wished, setWished] = useState({});    // pieces added to the shopping list this visit
  const wishIt = async (piece, pairs = []) => { if (!wished[piece] && await onWish({ piece, pairs_with: pairs, source: "unlock" })) setWished({ ...wished, [piece]: true }); };
  const top = useRef(null);
  const short = (mine.length ? mine : options.slice(0, 6));
  const shown = allStyles ? options : [...short, ...(short.includes(style) || !style ? [] : [style])];

  const described = items.filter((i) => !isUntagged(i));
  const waiting = items.length - described.length;
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const outfits = (result?.outfits || []).map((o) => ({ ...o, pieces: o.items.map((id) => byId[id]).filter(Boolean) })).filter((o) => o.pieces.length);

  useEffect(() => {
    const paths = outfits.flatMap((o) => o.pieces.map((p) => p.thumb_path));
    if (paths.length) db.photoUrls(paths).then((u) => setUrls((old) => ({ ...old, ...u }))).catch(() => {});
  }, [result, db]); // eslint-disable-line react-hooks/exhaustive-deps

  async function unlock() {
    setBusy(true); setError("");
    try {
      const styleDesc = styles.find((s) => s.name === style)?.description || "";
      const r = await db.suggestOutfits({ style, style_desc: styleDesc, occasion: occasion.trim(), season: season.toLowerCase(), count });
      setResult({ ...r, style, occasion, season });
      setWorn({});
      setTimeout(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  if (described.length < 4) return (
    <div className="scroll">
      <Dial />
      <Head title="Unlock a look" />
      <div className="pad">
        <div className="waitcard"><Icon name="sparkle" size={20} /><div>
          <b>Outfits need at least 4 described pieces.</b>
          <span className="small">You have {described.length} of {items.length} described so far.</span>
        </div></div>
        <button className="btn primary wide" onClick={onAdd}>{waiting ? `Describe my ${waiting} waiting pieces` : "Add more clothes"}</button>
      </div>
    </div>
  );

  return (
    <div className="scroll">
      <Dial />
      <Head title="Unlock a look" sub={`From ${described.length} described pieces${waiting ? ` · ${waiting} waiting` : ""}`} />
      <div className="tabs" role="tablist">
        {MODES.map(([id, label]) => <button key={id} role="tab" aria-selected={mode === id} className={mode === id ? "on" : ""} onClick={() => setMode(id)}>{label}</button>)}
      </div>

      {mode === "build" && <BuildOutfit db={db} items={items} described={described} styles={styles} built={built} setBuilt={setBuilt}
        urls={urls} setUrls={setUrls} onOpen={setOpenId} onTry={setTrying} onWore={onWore} wished={wished} wishIt={wishIt} />}

      {mode !== "build" && <>
      <div className="pad">
        <div className="field"><span>Style{mine.length ? " · your favorites first" : ""}</span>
          <div className="pills">
            {shown.map((s) => <button key={s} className={`pill ${style === s ? "on" : ""}`} onClick={() => setStyle(s)}>{s}</button>)}
            {options.length > shown.length && <button className="pill more" onClick={() => setAllStyles(true)}>+ {options.length - shown.length} more</button>}
            {allStyles && <button className="pill more" onClick={() => setAllStyles(false)}>Fewer</button>}
          </div>
        </div>
        <label className="field"><span>Occasion (optional)</span>
          <input className="in" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g. dinner out, lake weekend, church" />
        </label>
        <div className="field"><span>Weather (optional)</span>
          <div className="pills">{WEATHER.map((s) => <button key={s} className={`pill ${season === s ? "on" : ""}`} onClick={() => setSeason(season === s ? "" : s)}>{s}</button>)}</div>
        </div>
        <div className="field"><span>How many looks</span>
          <div className="pills">{COUNTS.map((n) => <button key={n} className={`pill ${count === n ? "on" : ""}`} onClick={() => setCount(n)}>{n}</button>)}</div>
        </div>
        <button className="btn primary wide" disabled={!style || busy} onClick={unlock}>
          {busy ? <><span className="spin light" />Putting looks together…</> : <><Icon name="unlock" size={20} />Unlock {count} looks</>}
        </button>
        {busy && <p className="small muted center">This takes about 20–40 seconds.</p>}
        {error && <p className="qerr" style={{ marginTop: 10 }}>{error}</p>}
      </div>

      {result && !busy && (
        <>
          <h2 className="section" ref={top}>{result.style}{result.occasion ? ` · ${result.occasion}` : ""}</h2>
          {outfits.length === 0 && <p className="empty">Your closet doesn't have enough for this style yet.</p>}
          {outfits.map((o, n) => <LookCard key={n} o={o} urls={urls} onOpen={setOpenId} onTry={() => setTrying(o)}
            worn={worn[n]} onWore={async () => { if (await onWore(o.pieces)) setWorn({ ...worn, [n]: true }); }} wished={wished} wishIt={wishIt} />)}
          {result.closet_gaps?.length > 0 && (
            <div className="pad">
              <div className="field"><span>Pieces that would unlock more {result.style} looks</span>
                <div className="pills">{result.closet_gaps.map((g) => <button key={g} className="pill gap" onClick={() => wishIt(g)}>{wished[g] ? "✓ " : "+ "}{g}</button>)}</div>
                <p className="small muted" style={{ marginTop: 8 }}>Tap one to add it to your shopping list. <button className="link" onClick={onShop}>Shop the gaps →</button></p>
              </div>
            </div>
          )}
        </>
      )}
      </>}
      {trying && <TryOnSheet db={db} pieces={trying.pieces} title={trying.title} style={mode === "build" ? "" : result?.style || ""} onClose={() => setTrying(null)} />}
      {byId[openId] && <ItemSheet db={db} item={byId[openId]} styles={styles} onClose={() => setOpenId(null)} onSave={onSave} onDescribe={onDescribe}
        onDelete={async (it) => { if (await onDelete(it)) setOpenId(null); }} />}
    </div>
  );
}

/** One finished look: pieces strip, why, tip, extras, try-on and "wearing it today". */
function LookCard({ o, urls, onOpen, onTry, worn, onWore, wished, wishIt, children }) {
  return (
    <article className="look">
      <Studs n={10} />
      <h3>{o.title}</h3>
      <div className="lookstrip">
        {o.pieces.map((p) => (
          <button key={p.id} className="lookpiece" onClick={() => onOpen(p.id)}>
            <div className="well">{urls[p.thumb_path] && <img src={urls[p.thumb_path]} alt="" />}</div>
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      {o.why && <p className="why">{o.why}</p>}
      {o.tip && <p className="tip"><b>Tip</b> {o.tip}</p>}
      {children}
      {o.add_piece && <p className="tip"><b>Even better with</b> {o.add_piece}{" "}
        <button className="addwish" onClick={() => wishIt(o.add_piece, o.pieces.map((p) => p.id))}>{wished[o.add_piece] ? "✓ on list" : "+ list"}</button></p>}
      <button className="btn primary wide" onClick={onTry}><Icon name="sparkle" size={18} />See it on me</button>
      <button className={`btn ${worn ? "" : "chrome"} wide`} disabled={worn} onClick={onWore}>
        {worn ? <><Icon name="check" size={18} />Logged — enjoy</> : "I'm wearing this today"}</button>
    </article>
  );
}

/** Build an outfit: she picks the pieces she wants to wear and/or types an idea; the AI finishes it from her closet
 *  and adds finishing touches (jewelry, belt, bag…), marking which ones she already owns. */
function BuildOutfit({ db, items, described, styles, built, setBuilt, urls, setUrls, onOpen, onTry, onWore, wished, wishIt }) {
  const [ids, setIds] = useState(built?.item_ids || []);
  const [idea, setIdea] = useState(built?.idea || "");
  const [occasion, setOccasion] = useState(built?.occasion || "");
  const [season, setSeason] = useState(built?.season || "");
  const [count, setCount] = useState(2);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [worn, setWorn] = useState({});
  const top = useRef(null);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const chosen = ids.map((id) => byId[id]).filter(Boolean);
  const looks = (built?.looks || []).map((o) => ({ ...o, pieces: o.items.map((id) => byId[id]).filter(Boolean),
    accessories: (o.accessories || []).map((a) => ({ ...a, item: a.item_id ? byId[a.item_id] : null })) })).filter((o) => o.pieces.length);

  useEffect(() => {
    const paths = [...chosen.map((p) => p.thumb_path), ...looks.flatMap((o) => [...o.pieces, ...o.accessories.map((a) => a.item).filter(Boolean)].map((p) => p.thumb_path))];
    if (paths.length) db.photoUrls(paths).then((u) => setUrls((old) => ({ ...old, ...u }))).catch(() => {});
  }, [built, ids.join(), db]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    setBusy(true); setError("");
    try {
      const r = await db.completeOutfit({ item_ids: ids, idea: idea.trim(), occasion: occasion.trim(), season: season.toLowerCase(), count });
      setBuilt({ ...r, item_ids: ids, idea, occasion, season });
      setWorn({});
      setTimeout(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  return (
    <>
      <div className="pad">
        <div className="field"><span>Pieces you want to wear</span>
          <div className="startstrip">
            {chosen.map((p) => (
              <div key={p.id} className="lookpiece light">
                <div className="well">{urls[p.thumb_path] && <img src={urls[p.thumb_path]} alt="" />}
                  <button className="x" aria-label={`Remove ${p.name}`} onClick={() => setIds(ids.filter((x) => x !== p.id))}><Icon name="close" size={14} /></button></div>
                <span>{p.name}</span>
              </div>
            ))}
            <button className="lookpiece light addtile" onClick={() => setPicking(true)}>
              <div className="well"><Icon name="plus" size={26} /></div><span>{chosen.length ? "Add / change" : "Pick from closet"}</span>
            </button>
          </div>
        </div>
        <label className="field"><span>Your idea (optional)</span>
          <textarea className="in" rows={2} value={idea} onChange={(e) => setIdea(e.target.value)}
            placeholder="e.g. my red sweater for a football game · something with my new boots" />
        </label>
        <label className="field"><span>Occasion (optional)</span>
          <input className="in" value={occasion} onChange={(e) => setOccasion(e.target.value)} placeholder="e.g. dinner out, lake weekend, church" />
        </label>
        <div className="field"><span>Weather (optional)</span>
          <div className="pills">{WEATHER.map((s) => <button key={s} className={`pill ${season === s ? "on" : ""}`} onClick={() => setSeason(season === s ? "" : s)}>{s}</button>)}</div>
        </div>
        <div className="field"><span>How many ways</span>
          <div className="pills">{[1, 2, 3].map((n) => <button key={n} className={`pill ${count === n ? "on" : ""}`} onClick={() => setCount(n)}>{n}</button>)}</div>
        </div>
        <button className="btn primary wide" disabled={busy || (!ids.length && !idea.trim())} onClick={go}>
          {busy ? <><span className="spin light" />Finishing your outfit…</> : <><Icon name="sparkle" size={20} />Complete my outfit</>}
        </button>
        {busy && <p className="small muted center">This takes about 20–40 seconds.</p>}
        {error && <p className="qerr" style={{ marginTop: 10 }}>{error}</p>}
      </div>

      {built && !busy && (
        <>
          <h2 className="section" ref={top}>Finished looks</h2>
          {looks.length === 0 && <p className="empty">Couldn't finish that one from your closet — try another piece or idea.</p>}
          {looks.map((o, n) => (
            <LookCard key={n} o={o} urls={urls} onOpen={onOpen} onTry={() => onTry(o)} worn={worn[n]}
              onWore={async () => { if (await onWore(o.pieces)) setWorn({ ...worn, [n]: true }); }} wished={wished} wishIt={wishIt}>
              {o.accessories.length > 0 && <div className="finish"><b>Finish with</b>
                <ul>{o.accessories.map((a) => (
                  <li key={a.idea}>
                    {a.item
                      ? <button className="own" onClick={() => onOpen(a.item.id)}>{urls[a.item.thumb_path] && <img src={urls[a.item.thumb_path]} alt="" />}{a.idea}<em>yours</em></button>
                      : <>{a.idea} <button className="addwish" onClick={() => wishIt(a.idea, o.pieces.map((p) => p.id))}>{wished[a.idea] ? "✓ on list" : "+ list"}</button></>}
                  </li>
                ))}</ul>
              </div>}
            </LookCard>
          ))}
          {built.shopping?.length > 0 && (
            <div className="pad">
              <div className="field"><span>Would complete these looks</span>
                <div className="pills">{built.shopping.map((g) => <button key={g.piece} className="pill gap" title={g.why}
                  onClick={() => wishIt(g.piece)}>{wished[g.piece] ? "✓ " : "+ "}{g.piece}</button>)}</div>
                <p className="small muted" style={{ marginTop: 8 }}>Tap one to add it to your shopping list.</p>
              </div>
            </div>
          )}
        </>
      )}
      {picking && <PiecePicker db={db} items={described} value={ids} urls={urls} setUrls={setUrls}
        onDone={(v) => { setIds(v); setPicking(false); }} onClose={() => setPicking(false)} />}
    </>
  );
}

function PiecePicker({ db, items, value, urls, setUrls, onDone, onClose }) {
  const [sel, setSel] = useState(value);
  const [cat, setCat] = useState("all");
  const cats = [...new Set(items.map((i) => i.category || "other"))];
  const shown = cat === "all" ? items : items.filter((i) => (i.category || "other") === cat);
  useEffect(() => { db.photoUrls(items.map((i) => i.thumb_path)).then((u) => setUrls((old) => ({ ...old, ...u }))).catch(() => {}); }, [db]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : sel.length >= 6 ? sel : [...sel, id]);
  return (
    <Sheet title="Pick your pieces" onClose={onClose}>
      <div className="tabs" role="tablist" style={{ padding: "0 0 2px" }}>
        <button role="tab" aria-selected={cat === "all"} className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>All</button>
        {cats.map((c) => <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{CATEGORY_LABEL[c] || c}</button>)}
      </div>
      <div className="grid pickgrid">
        {shown.map((i) => (
          <button key={i.id} className={`piece ${sel.includes(i.id) ? "picked" : ""}`} aria-pressed={sel.includes(i.id)} onClick={() => toggle(i.id)}>
            <div className="well">
              <span className="tick" aria-hidden="true">{sel.includes(i.id) && <Icon name="check" size={16} />}</span>
              {urls[i.thumb_path] && <img src={urls[i.thumb_path]} alt="" loading="lazy" />}
            </div>
            <div className="meta"><span className="name">{i.name}</span></div>
          </button>
        ))}
      </div>
      <div className="pickbar">
        <span className="small muted">{sel.length ? `${sel.length} picked` : "Tap up to 6"}</span>
        <button className="btn primary" onClick={() => onDone(sel)}>Done</button>
      </div>
    </Sheet>
  );
}
