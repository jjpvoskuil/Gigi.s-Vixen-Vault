// Add: snap or pick photos → shrunk on the phone → uploaded to the private vault → the AI describes each one.
// Every step is per photo, so one bad photo or a hiccup never loses the others; failures get a "Try again".
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { Dial, Head, Studs } from "./Shell.jsx";
import { isUntagged } from "./lib/closet.js";
import { photoStem, preparePhoto } from "./lib/photo.js";

const AI_AT_ONCE = 3;
const LABEL = { wait: "Waiting…", prep: "Shrinking photo…", upload: "Locking it in the vault…", describe: "AI is describing it…",
  done: "In the vault", saved: "Saved — not described yet", failed: "Didn't work" };

export default function AddScreen({ db, items, reload, onCloset }) {
  const [queue, setQueue] = useState([]);  // [{key, preview, status, error, item, file}]
  const [useAi, setUseAi] = useState(true);
  const [batch, setBatch] = useState(null); // {done, total, failed} while describing older pieces
  const cam = useRef(null), pick = useRef(null);
  const busy = queue.some((q) => !["done", "saved", "failed"].includes(q.status));
  const waiting = items.filter(isUntagged).filter((i) => !queue.some((q) => q.item?.id === i.id));

  const patch = (key, p) => setQueue((qs) => qs.map((q) => (q.key === key ? { ...q, ...p } : q)));
  useEffect(() => () => queue.forEach((q) => URL.revokeObjectURL(q.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function describe(entry, item) {
    patch(entry.key, { status: "describe", error: "" });
    try { const it = await db.describeItem(item.id); patch(entry.key, { status: "done", item: it }); }
    catch (e) { patch(entry.key, { status: "saved", item, error: e.message }); }
  }

  async function one(entry) {
    let item = entry.item;
    try {
      if (!item) {
        patch(entry.key, { status: "prep", error: "" });
        const blobs = await preparePhoto(entry.file);
        patch(entry.key, { status: "upload" });
        item = await db.addItem(blobs, photoStem("items"));
        patch(entry.key, { item });
      }
    } catch (e) { patch(entry.key, { status: "failed", error: e.message }); return; }
    if (useAi) await describe(entry, item); else patch(entry.key, { status: "saved" });
  }

  /** A few photos at a time (gentle on phone memory and data). */
  async function run(entries) {
    const pending = [];
    for (const e of entries) {
      pending.push(one(e));
      if (pending.length >= AI_AT_ONCE) await Promise.race(pending.map((p, i) => p.then(() => i))).then((i) => pending.splice(i, 1));
    }
    await Promise.all(pending);
    await reload();
  }

  function addFiles(list) {
    const files = [...(list || [])].filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
    if (!files.length) return;
    const entries = files.map((file) => ({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file), status: "wait" }));
    setQueue((qs) => [...entries, ...qs]);
    run(entries);
  }

  async function retry(entry) {
    if (entry.item) await describe(entry, entry.item); else await one(entry);
    await reload();
  }

  async function describeWaiting() {
    const todo = waiting.slice();
    let done = 0, failed = 0, lastError = "";
    setBatch({ done, total: todo.length, failed });
    const work = async () => {
      while (todo.length) {
        const it = todo.shift();
        try { await db.describeItem(it.id); done++; } catch (e) { failed++; lastError = e.message; }
        setBatch({ done, total: done + failed + todo.length, failed, lastError });
      }
    };
    await Promise.all(Array.from({ length: AI_AT_ONCE }, work));
    await reload();
    setBatch({ done, total: done + failed, failed, lastError, finished: true });
  }

  const doneCount = queue.filter((q) => q.status === "done" || q.status === "saved").length;

  return (
    <div className="scroll">
      <Dial />
      <Head title="Add to the vault" sub="Snap it — the AI writes it up" />

      <div className="leather addcard">
        <Studs />
        <div className="copy" style={{ maxWidth: "none" }}>
          <span className="kicker">New pieces</span>
          <span className="big">Lay it flat or hang it up</span>
          <span className="note">Good light, one piece per photo. Pick as many as you like.</span>
        </div>
        <div className="addbtns">
          <button className="btn primary" onClick={() => cam.current?.click()}><Icon name="camera" size={20} />Take a photo</button>
          <button className="btn chrome" onClick={() => pick.current?.click()}><Icon name="photos" size={20} />Pick photos</button>
        </div>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

      <div className="pad">
        <label className="switch">
          <span>Describe with AI as they upload</span>
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
        </label>
      </div>

      {queue.length > 0 && (
        <>
          <div className="countline"><span>{busy ? `Working… ${doneCount} of ${queue.length} done` : `${doneCount} of ${queue.length} added`}</span></div>
          <ul className="queue">
            {queue.map((q) => (
              <li key={q.key} className={`qrow ${q.status}`}>
                <img src={q.preview} alt="" />
                <div className="qtext">
                  <span className="qname">{q.item && !isUntagged(q.item) ? q.item.name : LABEL[q.status]}</span>
                  {q.item && !isUntagged(q.item) && <span className="qsub">{[q.item.primary_color, q.item.subcategory || q.item.category].filter(Boolean).join(" · ")}</span>}
                  {q.error && <span className="qerr">{q.error}</span>}
                </div>
                {(q.status === "failed" || (q.status === "saved" && q.error)) &&
                  <button className="pill" onClick={() => retry(q)}>Try again</button>}
                {["wait", "prep", "upload", "describe"].includes(q.status) && <span className="spin" aria-label={LABEL[q.status]} />}
                {q.status === "done" && <Icon name="check" size={20} className="icon ok" />}
              </li>
            ))}
          </ul>
          {!busy && (
            <div className="pad actions">
              <button className="btn" onClick={() => setQueue([])}>Clear list</button>
              <button className="btn dark" onClick={onCloset}><Icon name="hanger" size={18} />See the closet</button>
            </div>
          )}
        </>
      )}

      {(waiting.length > 0 || batch) && (
        <div className="pad">
          <div className="waitcard">
            <Icon name="sparkle" size={20} />
            <div style={{ flex: 1 }}>
              {batch && !batch.finished
                ? <><b>Describing… {batch.done + batch.failed} of {batch.total}</b><div className="bar"><i style={{ width: `${100 * (batch.done + batch.failed) / Math.max(1, batch.total)}%` }} /></div></>
                : batch?.finished
                  ? <><b>Described {batch.done} piece{batch.done === 1 ? "" : "s"}.</b>{batch.failed > 0 && <span className="qerr">{batch.failed} didn't work: {batch.lastError}</span>}</>
                  : <><b>{waiting.length} piece{waiting.length === 1 ? " is" : "s are"} waiting for a description.</b><span className="small muted">Outfits can only use described pieces.</span></>}
            </div>
          </div>
          {waiting.length > 0 && !(batch && !batch.finished) &&
            <button className="btn primary wide" onClick={describeWaiting}><Icon name="sparkle" size={18} />Describe {waiting.length === 1 ? "it" : `all ${waiting.length}`} now</button>}
        </div>
      )}
    </div>
  );
}
