// Unlock a look: pick a style (+ optional occasion / weather) → the AI builds outfits from her described pieces.
// Results live in App state, so switching tabs doesn't lose them.
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { Dial, Head, Studs } from "./Shell.jsx";
import { isUntagged } from "./lib/closet.js";

const WEATHER = ["Spring", "Summer", "Fall", "Winter", "Chilly", "Hot"];
const COUNTS = [2, 3, 4, 6];

export default function UnlockScreen({ db, items, styles, profile, result, setResult, onWore, onCloset, onAdd }) {
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
          {outfits.map((o, n) => (
            <article key={n} className="look">
              <Studs n={10} />
              <h3>{o.title}</h3>
              <div className="lookstrip">
                {o.pieces.map((p) => (
                  <button key={p.id} className="lookpiece" onClick={() => onCloset(p.id)}>
                    <div className="well">{urls[p.thumb_path] && <img src={urls[p.thumb_path]} alt="" />}</div>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
              {o.why && <p className="why">{o.why}</p>}
              {o.tip && <p className="tip"><b>Tip</b> {o.tip}</p>}
              {o.add_piece && <p className="tip"><b>Even better with</b> {o.add_piece}</p>}
              <button className={`btn ${worn[n] ? "" : "chrome"} wide`} disabled={worn[n]} onClick={async () => {
                if (await onWore(o.pieces)) setWorn({ ...worn, [n]: true });
              }}>{worn[n] ? <><Icon name="check" size={18} />Logged — enjoy</> : "I'm wearing this today"}</button>
            </article>
          ))}
          {result.closet_gaps?.length > 0 && (
            <div className="pad">
              <div className="field"><span>Pieces that would unlock more {result.style} looks</span>
                <div className="pills">{result.closet_gaps.map((g) => <span key={g} className="pill gap">{g}</span>)}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
