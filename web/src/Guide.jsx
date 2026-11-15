// Me → Colors & shape: the AI reads her measurements, photos and own coloring notes and works out the colors that
// flatter her skin tone, the cuts that suit her body shape, and the styles that fit her. Saved on her profile, and the
// outfit / shopping helpers use it automatically from then on.
import { useState } from "react";
import Icon from "./Icon.jsx";
import { Studs } from "./Shell.jsx";

const METALS = ["Gold", "Silver", "Both", "Not sure"];
const VEINS = ["Blue / purple", "Green", "A mix", "Not sure"];

export function Guide({ db, profile, styles, save, onTab }) {
  const c0 = profile.coloring || {};
  const [col, setCol] = useState({ hair: c0.hair || "", eyes: c0.eyes || "", skin: c0.skin || "", metal: c0.metal || "", veins: c0.veins || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const g = profile.guide && profile.guide.made_at ? profile.guide : null;
  const m = profile.measurements || {};
  const haveMeas = m.bust && m.waist && m.hips;
  const set = (k) => (e) => setCol({ ...col, [k]: e.target.value });
  const pick = (k, v) => setCol({ ...col, [k]: col[k] === v ? "" : v });

  async function make() {
    setBusy(true); setError("");
    const coloring = Object.fromEntries(Object.entries(col).map(([k, v]) => [k, v.trim()]));
    let ok = true;
    try { await db.saveProfile({ coloring }); await db.makeGuide(); } catch (e) { setError(e.message); ok = false; }
    if (ok) { await save(async () => {}, "Your guide is ready"); setEditing(false); }
    setBusy(false);
  }

  const form = (
    <div className="guideform">
      <h3 className="minor">About your coloring</h3>
      <p className="small muted">Helps the color read — phone photos often shift skin tone. Skip anything you're unsure of.</p>
      <div className="row2">
        <label className="field"><span>Hair color</span><input className="in" value={col.hair} onChange={set("hair")} placeholder="e.g. dark blonde, gray" /></label>
        <label className="field"><span>Eye color</span><input className="in" value={col.eyes} onChange={set("eyes")} placeholder="e.g. hazel" /></label>
      </div>
      <label className="field"><span>Skin, in your words</span><input className="in" value={col.skin} onChange={set("skin")} placeholder="e.g. fair, pink cheeks, burns easily" /></label>
      <div className="field"><span>Jewelry that looks best on you</span>
        <div className="pills">{METALS.map((v) => <button key={v} className={`pill ${col.metal === v ? "on" : ""}`} onClick={() => pick("metal", v)}>{v}</button>)}</div>
      </div>
      <div className="field"><span>Veins on the inside of your wrist look</span>
        <div className="pills">{VEINS.map((v) => <button key={v} className={`pill ${col.veins === v ? "on" : ""}`} onClick={() => pick("veins", v)}>{v}</button>)}</div>
      </div>
      {!haveMeas && <p className="small"><b>Tip:</b> add bust, waist and hips on <button className="link" onClick={() => onTab("measure")}>Measurements</button> for a better shape read.</p>}
      <p className="small muted">Uses your Front body photo, plus a <b>Face</b> close-up if you've added one (<button className="link" onClick={() => onTab("photos")}>Body photos</button>).</p>
      <button className="btn primary wide" disabled={busy} onClick={make}>
        {busy ? <><span className="spin light" />Reading your colors & shape…</> : <><Icon name="sparkle" size={20} />{g ? "Redo my guide" : "Make my guide"}</>}
      </button>
      {busy && <p className="small muted center">This takes about 30–60 seconds.</p>}
      {error && <p className="qerr" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );

  if (!g) return (
    <div className="pad">
      <div className="waitcard"><Icon name="sparkle" size={20} /><div>
        <b>Your colors & shape</b>
        <span className="small">The stylist works out the colors that flatter your skin tone, the cuts that suit your body shape, and the styles made for you. Outfit picks and shopping ideas use it automatically.</span>
      </div></div>
      {form}
    </div>
  );

  const c = g.colors || {}, sh = g.shape || {};
  return (
    <div className="pad">
      <article className="look guide">
        <Studs n={10} />
        <span className="kick">Your colors</span>
        <h3>{c.season || "Your palette"}</h3>
        <p className="tip">{[c.undertone && `${c.undertone} undertone`, c.contrast && `${c.contrast} contrast`].filter(Boolean).join(" · ")}</p>
        {c.summary && <p className="why">{c.summary}</p>}
        <div className="swatches">{(c.best || []).map((x) => <Swatch key={x.name} s={x} note={x.wear} />)}</div>
        {c.neutrals?.length > 0 && <><span className="kick">Neutrals to build on</span>
          <div className="swatches">{c.neutrals.map((x) => <Swatch key={x.name} s={x} />)}</div></>}
        {c.metals && <p className="tip"><b>Jewelry</b> {c.metals}</p>}
        {c.avoid?.length > 0 && <><span className="kick">Keep away from your face</span>
          <div className="swatches">{c.avoid.map((x) => <Swatch key={x.name} s={x} note={x.why} off />)}</div></>}
        {c.tip && <p className="tip"><b>Tip</b> {c.tip}</p>}
      </article>

      <article className="look guide">
        <Studs n={10} />
        <span className="kick">Your shape</span>
        <h3>{sh.shape || "Your shape"}</h3>
        {sh.summary && <p className="why">{sh.summary}</p>}
        {(sh.best || []).map((b) => <p key={b.area} className="tip"><b>{b.area}</b> {b.picks.join(" · ")}</p>)}
        {sh.avoid?.length > 0 && <p className="tip"><b>Go easy on</b> {sh.avoid.join(" · ")}</p>}
      </article>

      {g.styles?.length > 0 && <SuitedStyles g={g} profile={profile} styles={styles} save={save} />}

      <p className="small muted" style={{ marginTop: 14 }}>{g.confidence} Made {new Date(g.made_at).toLocaleDateString()}.</p>
      {editing ? form : <button className="btn chrome wide" onClick={() => setEditing(true)}>Update my coloring & redo</button>}
    </div>
  );
}

function Swatch({ s, note, off }) {
  return (
    <div className={`sw ${off ? "off" : ""}`}>
      <i style={{ background: s.hex || "#888" }} />
      <b>{s.name}</b>
      {note && <em>{note}</em>}
    </div>
  );
}

function SuitedStyles({ g, profile, styles, save }) {
  const mine = profile.my_styles || [];
  const known = new Map(styles.map((s) => [s.name.toLowerCase(), s.name]));
  const [busy, setBusy] = useState("");
  async function add(x) {
    setBusy(x.name);
    const name = known.get(x.name.toLowerCase()) || x.name;
    await save(async (d) => {
      if (!known.has(x.name.toLowerCase())) await d.addStyle(name, x.description || "");
      await d.saveProfile({ my_styles: [...mine.filter((s) => s !== name), name] });
    }, `Added “${name}” to my styles`);
    setBusy("");
  }
  return (
    <div className="field" style={{ marginTop: 16 }}><span>Styles that suit you</span>
      <ul className="suited">
        {g.styles.map((x) => {
          const name = known.get(x.name.toLowerCase()) || x.name;
          const have = mine.includes(name);
          return (
            <li key={x.name}>
              <div><b>{name}</b>{!known.has(x.name.toLowerCase()) && <em className="newtag">new</em>}<span className="small muted">{x.why}</span></div>
              {have ? <span className="small" style={{ color: "var(--good)" }}>✓ mine</span>
                : <button className="pill" disabled={!!busy} onClick={() => add(x)}>{busy === x.name ? "…" : "+ Add"}</button>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
