// Me: measurements & sizes, body photos (for try-on later), and her styles — same data as the Streamlit Me page.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { Dial, Head, Sheet } from "./Shell.jsx";
import { photoStem, preparePhoto } from "./lib/photo.js";
import { LooksOnMe } from "./TryOn.jsx";

const MEASUREMENTS = [
  ["bust", "Bust", "Fullest part, tape level across your back"],
  ["underbust", "Underbust", "Snug around the ribcage, right under the bust"],
  ["waist", "Waist", "Narrowest part, usually just above the belly button"],
  ["high_hip", "High hip", "Top of the hip bones, a few inches below the waist"],
  ["hips", "Hips", "Fullest part of your seat, feet together"],
  ["shoulders", "Shoulder width", "Across your back, shoulder point to shoulder point"],
  ["torso", "Torso length", "Top of the shoulder, over the bust, down to the waist"],
  ["arm", "Arm length", "Shoulder point to wrist bone, arm slightly bent"],
  ["inseam", "Inseam", "Crotch to ankle along the inside leg (or jeans that fit)"],
  ["thigh", "Thigh", "Fullest part of one thigh"],
];
const SIZES = [["tops", "Tops", "M or 8"], ["bottoms", "Pants / jeans", "8 or 29"], ["dresses", "Dresses", "8"], ["bra", "Bra", "34C"], ["shoes", "Shoes", "8.5"]];
const VIEWS = ["Front", "Side", "Back", "Other"];
const TABS = [["measure", "Measurements"], ["photos", "Body photos"], ["looks", "Looks on me"], ["styles", "My styles"]];

export default function MeScreen({ db, profile, styles, items, save }) {
  const [tab, setTab] = useState("measure");
  return (
    <div className="scroll">
      <Dial />
      <Head title="Me" sub="So the vault dresses you, not a mannequin" />
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === "measure" && <Measurements profile={profile} save={save} />}
      {tab === "photos" && <BodyPhotos db={db} save={save} />}
      {tab === "looks" && <LooksOnMe db={db} items={items} save={save} />}
      {tab === "styles" && <Styles profile={profile} styles={styles} save={save} />}
    </div>
  );
}

// ---------------------------------------------------------------- measurements
const str = (v) => (v === undefined || v === null || v === "" ? "" : String(v));
const numOrNull = (s) => { const n = parseFloat(String(s).replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };

function Measurements({ profile, save }) {
  const m = profile.measurements || {};
  const [f, setF] = useState(() => ({
    ft: m.height ? String(Math.floor(m.height / 12)) : "", inch: m.height ? str(+(m.height % 12).toFixed(2)) : "", weight: str(m.weight),
    ...Object.fromEntries(MEASUREMENTS.map(([k]) => [k, str(m[k])])),
    ...Object.fromEntries(SIZES.map(([k]) => [`size_${k}`, str((profile.sizes || {})[k])])),
    fit_notes: profile.fit_notes || "", color_notes: profile.color_notes || "",
  }));
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    const meas = {};
    for (const [k] of MEASUREMENTS) { const v = numOrNull(f[k]); if (v) meas[k] = v; }
    const ft = numOrNull(f.ft), inch = numOrNull(f.inch) || 0;
    if (ft) meas.height = ft * 12 + inch;
    const w = numOrNull(f.weight); if (w) meas.weight = Math.round(w);
    const sizes = {};
    for (const [k] of SIZES) { const v = f[`size_${k}`].trim(); if (v) sizes[k] = v; }
    setBusy(true);
    await save((d) => d.saveProfile({ measurements: meas, sizes, fit_notes: f.fit_notes.trim(), color_notes: f.color_notes.trim() }), "Saved");
    setBusy(false);
  }

  return (
    <div className="pad">
      <p className="small muted">Inches. Soft tape, snug but not tight, over light clothing. Leave anything blank you don't know yet.
        {" "}<button className="link" onClick={() => setHelp(!help)}>{help ? "Hide how-to" : "How to measure"}</button></p>
      <div className="row3">
        <label className="field"><span>Height ft</span><input className="in" inputMode="numeric" value={f.ft} onChange={set("ft")} placeholder="5" /></label>
        <label className="field"><span>in</span><input className="in" inputMode="decimal" value={f.inch} onChange={set("inch")} placeholder="4" /></label>
        <label className="field"><span>Weight lb</span><input className="in" inputMode="numeric" value={f.weight} onChange={set("weight")} placeholder="optional" /></label>
      </div>
      <div className="row2">
        {MEASUREMENTS.map(([k, label, hint]) => (
          <label key={k} className="field"><span>{label}</span>
            <input className="in" inputMode="decimal" value={f[k]} onChange={set(k)} />
            {help && <em className="hint">{hint}</em>}
          </label>
        ))}
      </div>
      <h3 className="minor">Usual sizes</h3>
      <div className="row3">
        {SIZES.map(([k, label, ph]) => (
          <label key={k} className="field"><span>{label}</span><input className="in" value={f[`size_${k}`]} onChange={set(`size_${k}`)} placeholder={ph} /></label>
        ))}
      </div>
      <label className="field"><span>What I like to show off / play down</span>
        <textarea className="in" rows={3} value={f.fit_notes} onChange={set("fit_notes")} placeholder="e.g. love my waist and legs, prefer to skim over my tummy" />
      </label>
      <label className="field"><span>Colors I love / avoid</span>
        <textarea className="in" rows={2} value={f.color_notes} onChange={set("color_notes")} placeholder="e.g. love jewel tones and black, avoid mustard" />
      </label>
      <button className="btn primary wide" disabled={busy} onClick={submit}><Icon name="check" size={18} />{busy ? "Saving…" : "Save"}</button>
    </div>
  );
}

// ---------------------------------------------------------------- body photos
function BodyPhotos({ db, save }) {
  const [photos, setPhotos] = useState(null);
  const [urls, setUrls] = useState({});
  const [picked, setPicked] = useState([]); // [{key, file, preview, label, keep}]
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState(null);
  const input = useRef(null);

  const refresh = useCallback(async () => {
    const ps = await db.listBodyPhotos();
    setPhotos(ps);
    const u = await db.photoUrls(ps.map((p) => p.thumb_path));
    setUrls((old) => ({ ...old, ...u }));
  }, [db]);
  useEffect(() => { refresh().catch(() => setPhotos([])); }, [refresh]);

  function choose(files) {
    const list = [...(files || [])].map((file, n) => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file), label: VIEWS[Math.min(n, 3)], keep: true }));
    setPicked(list);
  }
  const chosen = picked.filter((p) => p.keep);

  async function saveAll() {
    let n = 0;
    const ok = await save(async (d) => {
      for (const p of chosen) {
        setBusy(`Saving ${n + 1} of ${chosen.length}…`);
        await d.addBodyPhoto(await preparePhoto(p.file), photoStem("body"), p.label);
        n++;
      }
    }, `Saved ${chosen.length} photo${chosen.length === 1 ? "" : "s"}`);
    setBusy("");
    if (ok) { picked.forEach((p) => URL.revokeObjectURL(p.preview)); setPicked([]); }
    await refresh();
  }

  return (
    <div className="pad">
      <p className="small muted">Used later to show outfits on you. Stored privately — only the two of you can see them.</p>
      <details className="howto">
        <summary>How to take them</summary>
        <ul>
          <li>Full length, head to toe, standing straight, arms slightly away from your body.</li>
          <li>Fitted clothes (leggings and a fitted tee, or similar).</li>
          <li>Plain background, even light, phone at about waist height.</li>
          <li>At least one <b>Front</b>; <b>Side</b> and <b>Back</b> help too.</li>
        </ul>
      </details>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { choose(e.target.files); e.target.value = ""; }} />

      {picked.length === 0
        ? <button className="btn dark wide" onClick={() => input.current?.click()}><Icon name="camera" size={20} />Take or choose photos</button>
        : <>
            <h3 className="minor">Check {picked.length === 1 ? "this photo" : `these ${picked.length} photos`} before saving</h3>
            <div className="newbody">
              {picked.map((p) => (
                <div key={p.key} className={`nb ${p.keep ? "" : "off"}`}>
                  <img src={p.preview} alt="" />
                  <select className="in" value={p.label} onChange={(e) => setPicked(picked.map((x) => x.key === p.key ? { ...x, label: e.target.value } : x))}>
                    {VIEWS.map((v) => <option key={v}>{v}</option>)}
                  </select>
                  <label className="keep"><input type="checkbox" checked={p.keep} onChange={(e) => setPicked(picked.map((x) => x.key === p.key ? { ...x, keep: e.target.checked } : x))} /> Keep</label>
                </div>
              ))}
            </div>
            <div className="actions">
              <button className="btn" disabled={!!busy} onClick={() => setPicked([])}>Start over</button>
              <button className="btn primary" disabled={!chosen.length || !!busy} onClick={saveAll}>{busy || `Save ${chosen.length} photo${chosen.length === 1 ? "" : "s"}`}</button>
            </div>
          </>}

      <h3 className="minor">Saved photos{photos ? ` (${photos.length})` : ""}</h3>
      {photos === null ? <p className="small muted">Loading…</p>
        : photos.length === 0 ? <p className="small muted">None yet — take a Front photo to start.</p>
          : <div className="bodygrid">
              {photos.map((p) => (
                <button key={p.id} className="bp" onClick={() => setOpen(p)}>
                  <div className="well tall">{urls[p.thumb_path] && <img src={urls[p.thumb_path]} alt={p.label} />}</div>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>}

      {open && <BodySheet db={db} photo={open} onClose={() => setOpen(null)}
        onLabel={async (label) => { if (await save((d) => d.updateBodyPhoto(open.id, label), "Saved")) { setOpen({ ...open, label }); refresh(); } }}
        onDelete={async () => { if (await save((d) => d.deleteBodyPhoto(open), "Deleted")) { setOpen(null); refresh(); } }} />}
    </div>
  );
}

function BodySheet({ db, photo, onClose, onLabel, onDelete }) {
  const [big, setBig] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { db.photoUrls([photo.image_path]).then((u) => setBig(u[photo.image_path] || "")).catch(() => {}); }, [db, photo.image_path]);
  return (
    <Sheet title={`${photo.label} photo`} onClose={onClose}>
      <div className="hero tallhero">{big && <img src={big} alt={photo.label} />}</div>
      <div className="field"><span>View</span>
        <div className="pills">{VIEWS.map((v) => <button key={v} className={`pill ${photo.label === v ? "on" : ""}`} onClick={() => v !== photo.label && onLabel(v)}>{v}</button>)}</div>
      </div>
      <div className="actions">
        {confirm
          ? <button className="btn primary" onClick={onDelete}>Yes, delete for good</button>
          : <button className="btn danger" onClick={() => setConfirm(true)}><Icon name="trash" size={18} />Delete photo</button>}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- styles
function Styles({ profile, styles, save }) {
  const names = styles.map((s) => s.name);
  const current = (profile.my_styles || []).filter((s) => names.includes(s));
  const [mine, setMine] = useState(current);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const changed = [...mine].sort().join("|") !== [...current].sort().join("|");
  const toggle = (n) => setMine(mine.includes(n) ? mine.filter((x) => x !== n) : [...mine, n]);

  return (
    <div className="pad">
      <p className="small muted">Tap the styles you love. Outfit suggestions lean on these, and they're listed first on Unlock.</p>
      <div className="pills">
        {styles.map((s) => <button key={s.name} className={`pill ${mine.includes(s.name) ? "on" : ""}`} onClick={() => toggle(s.name)}>{s.name}</button>)}
      </div>
      {changed && <button className="btn primary wide" disabled={busy} onClick={async () => {
        setBusy(true); await save((d) => d.saveProfile({ my_styles: mine }), "Saved"); setBusy(false);
      }}><Icon name="check" size={18} />Save my styles</button>}

      <details className="howto">
        <summary>What each style means</summary>
        <dl className="styledefs">{styles.map((s) => <div key={s.name}><dt>{s.name}</dt><dd>{s.description || "—"}</dd></div>)}</dl>
      </details>

      <h3 className="minor">Add a style of my own</h3>
      <label className="field"><span>Style name</span><input className="in" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rodeo Glam" /></label>
      <label className="field"><span>What it means to you</span><input className="in" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Western with sparkle" /></label>
      <button className="btn dark wide" disabled={!name.trim() || busy} onClick={async () => {
        setBusy(true);
        if (await save((d) => d.addStyle(name, desc), `Added “${name.trim()}”`)) { setName(""); setDesc(""); }
        setBusy(false);
      }}>Add style</button>

      {styles.some((s) => s.custom) && <>
        <h3 className="minor">My own styles</h3>
        <div className="pills">{styles.filter((s) => s.custom).map((s) => (
          <button key={s.name} className="pill" aria-label={`Remove ${s.name}`} onClick={() => {
            if (confirm(`Remove the style “${s.name}”?`)) save(async (d) => { await d.deleteStyle(s.name); if (mine.includes(s.name)) await d.saveProfile({ my_styles: mine.filter((x) => x !== s.name) }); }, "Removed");
          }}>{s.name} ×</button>
        ))}</div>
      </>}
    </div>
  );
}
