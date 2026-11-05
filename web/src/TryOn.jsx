// "See it on me": her body photo + the chosen pieces → Google's image model draws her wearing them.
// Each result is saved (tryons table + vault/tryons/…) so looking at it again costs nothing.
import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { Sheet } from "./Shell.jsx";
import { photoStem, preparePhoto } from "./lib/photo.js";

const b64ToBlob = (b64, mime) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: mime || "image/png" });

export function TryOnSheet({ db, pieces, title = "", style = "", onClose, onSaved }) {
  const [bodies, setBodies] = useState(null);
  const [urls, setUrls] = useState({});
  const [bodyId, setBodyId] = useState(null);
  const [state, setState] = useState("pick"); // pick | working | done | error
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // {url, tryon}

  useEffect(() => {
    (async () => {
      try {
        const bs = await db.listBodyPhotos();
        setBodies(bs);
        setBodyId((bs.find((b) => b.label === "Front") || bs[0])?.id || null);
        const u = await db.photoUrls([...bs.map((b) => b.thumb_path), ...pieces.map((p) => p.thumb_path)]);
        setUrls(u);
      } catch (e) { setError(e.message); setBodies([]); }
    })();
  }, [db]); // eslint-disable-line react-hooks/exhaustive-deps

  async function go() {
    setState("working"); setError("");
    try {
      const r = await db.tryOn(bodyId, pieces.map((p) => p.id));
      const blob = b64ToBlob(r.image, r.mime);
      const url = URL.createObjectURL(blob);
      setResult({ url });
      setState("done");
      try { // save it so it can be looked at again for free
        const t = await db.addTryon(await preparePhoto(blob), photoStem("tryons"), { title, style, item_ids: r.item_ids || pieces.map((p) => p.id), body_photo_id: bodyId });
        setResult({ url, tryon: t });
        onSaved?.(t);
      } catch (e) { setError(`Couldn't save it to “Looks on me”: ${e.message}`); }
    } catch (e) { setError(e.message); setState("error"); }
  }

  return (
    <Sheet title={title ? `${title} — on me` : "See it on me"} onClose={onClose}>
      <div className="tostrip">
        {pieces.map((p) => <div key={p.id} className="well"><img src={urls[p.thumb_path] || undefined} alt={p.name} title={p.name} /></div>)}
      </div>

      {state === "done" && result
        ? <>
            <div className="hero tallhero tryhero"><img src={result.url} alt="You wearing this outfit" /></div>
            <p className="small muted center">{result.tryon ? "Saved to Me → Looks on me." : "Saving…"} AI picture — a guide to how it looks together, not an exact fit.</p>
            {error && <p className="qerr">{error}</p>}
            <div className="actions">
              <button className="btn" onClick={() => { setState("pick"); setResult(null); }}>Try another photo</button>
              <button className="btn dark" onClick={onClose}><Icon name="check" size={18} />Done</button>
            </div>
          </>
        : bodies === null ? <p className="empty">Loading…</p>
          : bodies.length === 0 ? <div className="waitcard"><Icon name="me" size={20} /><div><b>Add a body photo first.</b>
              <span className="small">Me → Body photos: a full-length Front photo in fitted clothes works best.</span></div></div>
            : <>
                <div className="field"><span>Which photo of you</span>
                  <div className="bodypick">
                    {bodies.map((b) => (
                      <button key={b.id} className={bodyId === b.id ? "on" : ""} aria-pressed={bodyId === b.id} onClick={() => setBodyId(b.id)} disabled={state === "working"}>
                        <div className="well tall">{urls[b.thumb_path] && <img src={urls[b.thumb_path]} alt="" />}</div>
                        <span>{b.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button className="btn primary wide" disabled={!bodyId || state === "working"} onClick={go}>
                  {state === "working" ? <><span className="spin light" />Dressing you…</> : <><Icon name="sparkle" size={18} />See it on me</>}
                </button>
                <p className="small muted center">{state === "working" ? "Takes about 15–40 seconds." : "Each picture costs about 7¢ (Google)."}</p>
                {error && <p className="qerr">{error}</p>}
              </>}
    </Sheet>
  );
}

/** Me → Looks on me: every saved try-on. */
export function LooksOnMe({ db, items, save }) {
  const [list, setList] = useState(null);
  const [urls, setUrls] = useState({});
  const [open, setOpen] = useState(null);
  const [big, setBig] = useState("");
  const [confirm, setConfirm] = useState(false);
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));

  const refresh = async () => {
    const ts = await db.listTryons();
    setList(ts);
    setUrls(await db.photoUrls(ts.map((t) => t.thumb_path)));
  };
  useEffect(() => { refresh().catch(() => setList([])); }, [db]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setBig(""); setConfirm(false);
    if (open) db.photoUrls([open.image_path]).then((u) => setBig(u[open.image_path] || "")).catch(() => {});
  }, [open, db]);

  if (list === null) return <p className="empty">Loading…</p>;
  return (
    <div className="pad">
      <p className="small muted">Outfits you've seen on yourself. Tap <b>See it on me</b> on any Unlock look, or select pieces in the Closet and tap <b>Try on</b>.</p>
      {list.length === 0 ? <p className="small muted">None yet.</p>
        : <div className="bodygrid">
            {list.map((t) => (
              <button key={t.id} className="bp" onClick={() => setOpen(t)}>
                <div className="well tall">{urls[t.thumb_path] && <img src={urls[t.thumb_path]} alt={t.title} />}</div>
                <span>{t.title || new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </button>
            ))}
          </div>}
      {open && (
        <Sheet title={open.title || "Look on me"} onClose={() => setOpen(null)}
          tools={<button className="round" aria-label="Delete this look" onClick={() => setConfirm(true)}><Icon name="trash" size={20} /></button>}>
          {confirm && <div className="confirmbar"><span>Delete this picture?</span><div className="actions">
            <button className="btn" onClick={() => setConfirm(false)}>Keep it</button>
            <button className="btn primary" onClick={async () => { if (await save((d) => d.deleteTryon(open), "Deleted")) { setOpen(null); refresh(); } }}>Yes, delete</button>
          </div></div>}
          <div className="hero tallhero tryhero">{big && <img src={big} alt={open.title || "Look on me"} />}</div>
          <p className="pmeta">{[open.style, new Date(open.created_at).toLocaleDateString()].filter(Boolean).join(" · ")}</p>
          <ul className="pieces">{(open.item_ids || []).map((id) => <li key={id}>{byId[id]?.name || "(piece no longer in the closet)"}</li>)}</ul>
        </Sheet>
      )}
    </div>
  );
}
