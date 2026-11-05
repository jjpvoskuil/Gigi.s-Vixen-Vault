// Punch list: bugs, changes and ideas for the app. Saved to GitHub (via the vault-punch server function) where
// Claude reads it at the start of each work session and writes back status + notes.
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { Dial, Head, Sheet } from "./Shell.jsx";
import { PAGES, PRIORITIES, STATUSES, TYPES, allScreenshots, sortItems } from "./lib/punch.js";
import { screenshotB64 } from "./lib/photo.js";

const MARK = { Bug: "🐞", Change: "✏️", "New idea": "💡", Question: "❓" };
const WHO = ["Gigi", "John"];
export const whoFor = (email) => (/jjvoskuil3272/i.test(email || "") ? "Gigi" : /jjpvoskuil/i.test(email || "") ? "John" : "");
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

export default function PunchScreen({ db, email, onBack, toast }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try { setItems((await db.punch("list")).items); } catch (e) { setError(e.message); }
  }, [db]);
  useEffect(() => { load(); }, [load]);

  /** Run a punch action, then refresh the list. Returns the result, or null after showing the problem. */
  const act = async (action, body, ok) => {
    try { const r = await db.punch(action, body); await load(); if (ok) toast(ok); return r; }
    catch (e) { toast(e.message); return null; }
  };

  const { open, closed } = sortItems(items || []);
  const current = (items || []).find((i) => i.id === openId);

  return (
    <div className="scroll">
      <Dial />
      <Head eyebrow="More" title="Punch list" sub="Bugs, changes & ideas — Claude works through these">
        <button className="round" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
      </Head>
      <div className="pad">
        <button className="btn primary wide" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Add an item</button>
      </div>

      {error && <div className="pad"><p className="qerr">{error}</p><button className="btn wide" onClick={load}>Try again</button></div>}
      {items === null && !error && <p className="empty">Loading…</p>}

      {items && <>
        <h2 className="section">To do · {open.length}</h2>
        {open.length === 0 && <p className="empty">Nothing open. 🎉</p>}
        <ul className="punchlist">{open.map((i) => <Row key={i.id} item={i} onOpen={() => setOpenId(i.id)} />)}</ul>
        {closed.length > 0 && (
          <div className="pad"><button className="pill more" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"} finished · {closed.length}</button></div>
        )}
        {showDone && <ul className="punchlist">{closed.map((i) => <Row key={i.id} item={i} onOpen={() => setOpenId(i.id)} />)}</ul>}
        <div className="pad"><button className="link" onClick={load}>Refresh</button></div>
      </>}

      {adding && <AddSheet email={email} onClose={() => setAdding(false)}
        onAdd={async (body) => { if (await act("add", body, "Added — Claude will see it")) setAdding(false); }} />}
      {current && <ItemSheet db={db} item={current} email={email} act={act} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Row({ item, onOpen }) {
  const notes = (item.comments || []).length;
  return (
    <li>
      <button className={`prow ${item.status === "Done" || item.status === "Won't do" ? "done" : ""}`} onClick={onOpen}>
        <span className="pmark" aria-hidden="true">{MARK[item.type] || "•"}</span>
        <span className="ptext">
          <span className="ptitle">{item.priority === "High" && <b className="hi">High</b>}{item.title}</span>
          <span className="pmeta">{[item.page, item.added_by && `from ${item.added_by}`, day(item.created), notes && `${notes} note${notes === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</span>
          {item.dev_notes && item.status !== "Open" && <span className="pdev">{item.dev_notes}</span>}
        </span>
        <span className={`chip s-${(item.status || "Open").replace(/\W/g, "")}`}>{item.status || "Open"}</span>
      </button>
    </li>
  );
}

function ShotPicker({ value, onChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="field"><span>Screenshot (optional)</span>
      <input ref={input} type="file" accept="image/*" hidden onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = "";
        if (!f) return;
        setBusy(true); setErr("");
        try { onChange(await screenshotB64(f)); } catch (x) { setErr(x.message); }
        setBusy(false);
      }} />
      {value
        ? <div className="shotpick"><img src={`data:image/jpeg;base64,${value}`} alt="Screenshot to attach" /><button className="pill" onClick={() => onChange("")}>Remove</button></div>
        : <button className="btn" onClick={() => input.current?.click()} disabled={busy}><Icon name="photos" size={18} />{busy ? "Preparing…" : "Attach a screenshot"}</button>}
      {err && <span className="qerr">{err}</span>}
    </div>
  );
}

function Fields({ f, set }) {
  return <>
    <label className="field"><span>What should change?</span>
      <input className="in" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Photos don't show after I take them" />
    </label>
    <label className="field"><span>Details (optional)</span>
      <textarea className="in" rows={3} value={f.details} onChange={(e) => set({ details: e.target.value })} placeholder="What you did, what you expected, what happened instead" />
    </label>
    <div className="field"><span>Type</span>
      <div className="pills">{TYPES.map((t) => <button key={t} className={`pill ${f.type === t ? "on" : ""}`} onClick={() => set({ type: t })}>{MARK[t]} {t}</button>)}</div>
    </div>
    <label className="field"><span>Where in the app</span>
      <select className="in" value={f.page} onChange={(e) => set({ page: e.target.value })}>
        {[...new Set([...PAGES, f.page])].map((p) => <option key={p}>{p}</option>)}
      </select>
    </label>
    <div className="field"><span>Priority</span>
      <div className="pills">{PRIORITIES.map((p) => <button key={p} className={`pill ${f.priority === p ? "on" : ""}`} onClick={() => set({ priority: p })}>{p}</button>)}</div>
    </div>
  </>;
}

function AddSheet({ email, onClose, onAdd }) {
  const [f, setF] = useState({ title: "", details: "", type: "Change", page: "Other", priority: "Normal", added_by: whoFor(email) || "Gigi" });
  const [shot, setShot] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p) => setF({ ...f, ...p });
  return (
    <Sheet title="Add to the punch list" onClose={onClose}>
      <Fields f={f} set={set} />
      <div className="field"><span>From</span>
        <div className="pills">{WHO.map((w) => <button key={w} className={`pill ${f.added_by === w ? "on" : ""}`} onClick={() => set({ added_by: w })}>{w}</button>)}</div>
      </div>
      <ShotPicker value={shot} onChange={setShot} />
      <button className="btn primary wide" disabled={!f.title.trim() || busy} onClick={async () => { setBusy(true); await onAdd({ fields: f, shot: shot || undefined }); setBusy(false); }}>
        <Icon name="check" size={18} />{busy ? "Saving…" : "Add to punch list"}
      </button>
    </Sheet>
  );
}

function ItemSheet({ db, item, email, act, onClose }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(item);
  const [note, setNote] = useState("");
  const [who, setWho] = useState(whoFor(email) || "Gigi");
  const [shot, setShot] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [shots, setShots] = useState({});
  const paths = allScreenshots(item);

  useEffect(() => {
    let live = true;
    for (const p of paths) {
      if (shots[p]) continue;
      db.punch("shot", { path: p }).then((r) => live && setShots((s) => ({ ...s, [p]: r.data || "x" }))).catch(() => live && setShots((s) => ({ ...s, [p]: "x" })));
    }
    return () => { live = false; };
  }, [paths.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn) => { setBusy(true); const r = await fn(); setBusy(false); return r; };

  return (
    <Sheet title={item.title} onClose={onClose}
      tools={<button className="round" aria-label="Delete item" onClick={() => setConfirm(true)}><Icon name="trash" size={20} /></button>}>
      {confirm && (
        <div className="confirmbar"><span>Delete this punch list item?</span>
          <div className="actions">
            <button className="btn" onClick={() => setConfirm(false)}>Keep it</button>
            <button className="btn primary" onClick={() => run(async () => { if (await act("delete", { id: item.id }, "Deleted")) onClose(); })}>Yes, delete</button>
          </div>
        </div>
      )}
      <p className="pmeta">{MARK[item.type]} {item.type} · {item.page} · {item.priority} priority{item.added_by ? ` · from ${item.added_by}` : ""} · {day(item.created)}</p>

      {editing
        ? <>
            <Fields f={f} set={(p) => setF({ ...f, ...p })} />
            <div className="actions">
              <button className="btn" onClick={() => { setF(item); setEditing(false); }}>Cancel</button>
              <button className="btn primary" disabled={busy || !String(f.title).trim()} onClick={() => run(async () => {
                if (await act("edit", { id: item.id, fields: { title: f.title, details: f.details, type: f.type, page: f.page, priority: f.priority } }, "Saved")) setEditing(false);
              })}>Save changes</button>
            </div>
          </>
        : <>
            {item.details && <p className="pdetails">{item.details}</p>}
            <button className="link" onClick={() => { setF(item); setEditing(true); }}>Edit wording, type or priority</button>
          </>}

      {paths.map((p) => (
        <div key={p} className="pshot">
          {!shots[p] ? <span className="small muted">Loading screenshot…</span>
            : shots[p] === "x" ? <span className="small muted">(screenshot couldn't be loaded)</span>
              : <img src={`data:image/jpeg;base64,${shots[p]}`} alt="Screenshot" />}
        </div>
      ))}

      {(item.comments || []).map((c, n) => (
        <div key={n} className="pnote"><b>{c.by || "Note"}</b> <span>{day(c.at)}</span><p>{c.text}</p></div>
      ))}
      {item.dev_notes && <div className="pnote dev"><b>Claude</b><p>{item.dev_notes}</p></div>}

      <div className="field"><span>Status</span>
        <div className="pills">{STATUSES.map((s) => <button key={s} className={`pill ${item.status === s ? "on" : ""}`} disabled={busy}
          onClick={() => s !== item.status && run(() => act("status", { id: item.id, status: s }, `Marked ${s}`))}>{s}</button>)}</div>
      </div>

      <h3 className="minor">Add more info</h3>
      <textarea className="in" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to add? (reopens it if it was finished)" />
      <div className="pills" style={{ margin: "10px 0" }}>{WHO.map((w) => <button key={w} className={`pill ${who === w ? "on" : ""}`} onClick={() => setWho(w)}>{w}</button>)}</div>
      <ShotPicker value={shot} onChange={setShot} />
      <button className="btn dark wide" disabled={busy || (!note.trim() && !shot)} onClick={() => run(async () => {
        if (await act("edit", { id: item.id, comment: note.trim() ? { by: who, text: note } : undefined, shot: shot || undefined }, "Added")) { setNote(""); setShot(""); }
      })}>{busy ? "Saving…" : "Add note"}</button>
    </Sheet>
  );
}
