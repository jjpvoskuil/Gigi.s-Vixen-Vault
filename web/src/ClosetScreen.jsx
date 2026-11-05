import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon.jsx";
import { Dial, Head, Sheet, Studs } from "./Shell.jsx";
import { TryOnSheet } from "./TryOn.jsx";
import { CATEGORIES, CATEGORY_LABEL, FORMALITY, SEASONS, SORTS, categoryCounts, filterSort, isUntagged } from "./lib/closet.js";

const QUICK = [["fav", "Favorites"], ["leather", "Leather"], ["lace", "Lace"]];

export default function ClosetScreen({ db, items, styles, onSave, onDelete, onDeleteMany, onUnlock, onDescribe, onDescribeAll }) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [filters, setFilters] = useState({ styles: [], seasons: [], sort: "Newest" });
  const [showFilters, setShowFilters] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [picking, setPicking] = useState(false); // select-several mode
  const [sel, setSel] = useState([]);
  const [sure, setSure] = useState(false);
  const [trying, setTrying] = useState(false);
  const stopPicking = () => { setPicking(false); setSel([]); setSure(false); };
  const [urls, setUrls] = useState({});

  const cats = useMemo(() => categoryCounts(items), [items]);
  const quick = QUICK.filter(([id]) => id === "fav" ? items.some((i) => i.favorite) : filterSort(items, { q: id }).length);
  const shown = useMemo(() => {
    const f = { q: q.trim(), styles: filters.styles, seasons: filters.seasons, sort: filters.sort };
    if (tab === "fav") f.fav = true;
    else if (tab === "leather" || tab === "lace") f.q = `${tab} ${f.q}`.trim();
    else if (tab !== "all") f.cats = [tab];
    return filterSort(items, f);
  }, [items, tab, q, filters]);
  const untagged = items.filter(isUntagged).length;
  const favs = items.filter((i) => i.favorite);
  const fan = (favs.length >= 3 ? favs : items).slice(0, 3);
  const filtered = filters.styles.length + filters.seasons.length + (filters.sort !== "Newest" ? 1 : 0);

  useEffect(() => {
    const paths = [...shown.slice(0, 80), ...fan].map((i) => i.thumb_path);
    db.photoUrls(paths).then((u) => setUrls((old) => ({ ...old, ...u }))).catch(() => {});
  }, [shown, db]);

  const open = items.find((i) => i.id === openId);

  return (
    <div className="scroll">
      <Dial />
      <Head title="Velvet Vault" sub={`${items.length} pieces · kept under lock & key`}>
        <button className={`round ${searching ? "on" : ""}`} aria-label="Search" onClick={() => { setSearching(!searching); if (searching) setQ(""); }}>
          <Icon name="search" size={20} />
        </button>
      </Head>
      {searching && (
        <label className="search">
          <Icon name="search" size={18} className="icon muted" />
          <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search denim, red, leather…" aria-label="Search your closet" />
        </label>
      )}

      <button className="leather" onClick={onUnlock}>
        <Studs />
        <div className="copy">
          <span className="kicker">Tonight</span>
          <span className="big">Unlock a look</span>
          <span className="note">Bound to impress · from your closet</span>
        </div>
        <div className="fan" aria-hidden="true">{fan.map((i) => <img key={i.id} src={urls[i.thumb_path] || undefined} alt="" />)}</div>
      </button>

      {untagged > 0 && (
        <button className="banner" onClick={onDescribeAll}><Icon name="sparkle" size={18} />
          <span style={{ flex: 1, textAlign: "left" }}>{untagged} piece{untagged === 1 ? " needs" : "s need"} a description before outfits can use {untagged === 1 ? "it" : "them"}.</span>
          <b>Describe</b></button>
      )}

      <div className="tabs" role="tablist" aria-label="Show">
        <button role="tab" aria-selected={tab === "all"} className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>All</button>
        {quick.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>)}
        {cats.map((c) => (
          <button key={c.id} role="tab" aria-selected={tab === c.id} className={tab === c.id ? "on" : ""} onClick={() => setTab(c.id)}>
            {CATEGORY_LABEL[c.id]}<span className="n">{c.count}</span>
          </button>
        ))}
      </div>
      <div className="countline">
        <span>{shown.length === items.length ? `${items.length} pieces` : `${shown.length} of ${items.length}`}{filters.sort !== "Newest" ? ` · ${filters.sort.toLowerCase()}` : ""}</span>
        <span className="pills">
          <button className={`pill ${picking ? "on" : ""}`} style={{ minHeight: 34 }} onClick={() => (picking ? stopPicking() : setPicking(true))}>
            {picking ? "Cancel" : "Select"}
          </button>
          <button className="pill" style={{ minHeight: 34 }} onClick={() => setShowFilters(true)}>
            <Icon name="sliders" size={16} /> Filter{filtered ? ` · ${filtered}` : ""}
          </button>
        </span>
      </div>

      {shown.length === 0
        ? <p className="empty">Nothing in the vault matches that.</p>
        : <div className="grid">
            {shown.map((i) => (
              <button key={i.id} className={`piece ${sel.includes(i.id) ? "picked" : ""}`} aria-pressed={picking ? sel.includes(i.id) : undefined}
                onClick={() => (picking ? (setSure(false), setSel(toggle(sel, i.id))) : setOpenId(i.id))}>
                <div className="well">
                  {picking && <span className="tick" aria-hidden="true">{sel.includes(i.id) && <Icon name="check" size={16} />}</span>}
                  {urls[i.thumb_path] && <img src={urls[i.thumb_path]} alt="" loading="lazy" />}
                  {i.favorite && <span className="badge" aria-label="Favorite"><Icon name="heart" /></span>}
                  {isUntagged(i) && <span className="flag">Needs a description</span>}
                </div>
                <div className="meta">
                  <span className="name">{i.name || "Untitled"}</span>
                  <span className="worn">{i.times_worn ? `worn ${i.times_worn}×` : "new"}</span>
                </div>
              </button>
            ))}
          </div>}

      {picking && <div style={{ height: 76 }} />}
      {picking && (
        <div className="selbar">
          <span>{sel.length ? `${sel.length} selected` : "Tap pieces to select"}</span>
          {!sure && <button className="btn chrome" disabled={!sel.length || sel.length > 8} onClick={() => setTrying(true)}><Icon name="sparkle" size={18} />Try on</button>}
          {sure
            ? <button className="btn primary" onClick={async () => { if (await onDeleteMany(items.filter((i) => sel.includes(i.id)))) stopPicking(); }}>Yes, delete {sel.length}</button>
            : <button className="btn danger" disabled={!sel.length} onClick={() => setSure(true)}><Icon name="trash" size={18} />Delete</button>}
        </div>
      )}

      {trying && <TryOnSheet db={db} pieces={items.filter((i) => sel.includes(i.id))} onClose={() => setTrying(false)} onSaved={() => stopPicking()} />}
      {showFilters && <FilterSheet styles={styles} value={filters} onChange={setFilters} onClose={() => setShowFilters(false)} />}
      {open && <ItemSheet db={db} item={open} styles={styles} onClose={() => setOpenId(null)} onSave={onSave} onDescribe={onDescribe}
        onDelete={async (it) => { if (await onDelete(it)) setOpenId(null); }} />}
    </div>
  );
}

function toggle(list, v) { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }

function FilterSheet({ styles, value, onChange, onClose }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <Sheet title="Filter & sort" onClose={onClose}>
      <div className="field"><span>Sort</span>
        <div className="pills">{SORTS.map((s) => <button key={s} className={`pill ${value.sort === s ? "on" : ""}`} onClick={() => set("sort", s)}>{s}</button>)}</div>
      </div>
      <div className="field"><span>Season</span>
        <div className="pills">{SEASONS.map((s) => <button key={s} className={`pill ${value.seasons.includes(s) ? "on" : ""}`} onClick={() => set("seasons", toggle(value.seasons, s))}>{s}</button>)}</div>
      </div>
      <div className="field"><span>Style</span>
        <div className="pills">{styles.map((s) => <button key={s.name} className={`pill ${value.styles.includes(s.name) ? "on" : ""}`} onClick={() => set("styles", toggle(value.styles, s.name))}>{s.name}</button>)}</div>
      </div>
      <div className="actions">
        <button className="btn" onClick={() => onChange({ styles: [], seasons: [], sort: "Newest" })}>Reset</button>
        <button className="btn dark" onClick={onClose}>Show pieces</button>
      </div>
    </Sheet>
  );
}

const EDIT_KEYS = ["name", "category", "subcategory", "primary_color", "colors", "pattern", "material", "fit", "formality",
  "seasons", "styles", "brand", "size", "description", "notes"];

export function ItemSheet({ db, item, styles, onClose, onSave, onDelete, onDescribe }) {
  const [f, setF] = useState(() => ({ ...item, colors: (item.colors || []).join(", ") }));
  const [hero, setHero] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { db.photoUrls([item.image_path]).then((u) => setHero(u[item.image_path] || "")).catch(() => {}); }, [item.image_path, db]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fields = () => ({ ...Object.fromEntries(EDIT_KEYS.map((k) => [k, f[k] ?? ""])),
    colors: String(f.colors || "").split(",").map((c) => c.trim()).filter(Boolean), seasons: f.seasons || [], styles: f.styles || [] });
  const quick = async (patch, ok) => { setBusy(true); await onSave(item.id, patch, ok); setBusy(false); };
  const styleNames = styles.map((s) => s.name);

  return (
    <Sheet title={item.name || "Item"} onClose={onClose}
      tools={<button className="round" aria-label="Delete this piece" onClick={() => setConfirm(true)}><Icon name="trash" size={20} /></button>}>
      {confirm && (
        <div className="confirmbar">
          <span>Delete this piece and its photo for good?</span>
          <div className="actions">
            <button className="btn" onClick={() => setConfirm(false)}>Keep it</button>
            <button className="btn primary" onClick={() => onDelete(item)}>Yes, delete</button>
          </div>
        </div>
      )}
      <div className="hero">{hero && <img src={hero} alt={item.name || "Closet item"} />}</div>
      <div className="actions" style={{ marginBottom: 18 }}>
        <button className={`btn ${item.favorite ? "primary" : ""}`} disabled={busy} onClick={() => quick({ favorite: !item.favorite }, item.favorite ? "Removed from favorites" : "Added to favorites")}>
          <Icon name="heart" size={18} style={item.favorite ? { fill: "currentColor" } : undefined} />{item.favorite ? "Favorite ✓" : "Make favorite"}
        </button>
        <button className="btn dark" disabled={busy} onClick={() => quick({ times_worn: (item.times_worn || 0) + 1 }, "Logged — wear it well")}>
          Wore it today · {item.times_worn || 0}
        </button>
      </div>

      <label className="field"><span>Name</span><input className="in" value={f.name || ""} onChange={set("name")} /></label>
      <div className="row2">
        <label className="field"><span>Category</span>
          <select className="in" value={CATEGORIES.includes(f.category) ? f.category : "other"} onChange={set("category")}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field"><span>Type</span><input className="in" value={f.subcategory || ""} onChange={set("subcategory")} placeholder="e.g. blouse, jeans" /></label>
      </div>
      <div className="row2">
        <label className="field"><span>Main color</span><input className="in" value={f.primary_color || ""} onChange={set("primary_color")} /></label>
        <label className="field"><span>Pattern</span><input className="in" value={f.pattern || ""} onChange={set("pattern")} /></label>
      </div>
      <label className="field"><span>All colors</span><input className="in" value={f.colors} onChange={set("colors")} placeholder="comma separated" /></label>
      <div className="row2">
        <label className="field"><span>Material</span><input className="in" value={f.material || ""} onChange={set("material")} /></label>
        <label className="field"><span>Fit</span><input className="in" value={f.fit || ""} onChange={set("fit")} /></label>
      </div>
      <div className="field"><span>Dressiness</span>
        <div className="pills">{FORMALITY.map((x) => <button key={x} className={`pill ${f.formality === x ? "on" : ""}`} onClick={() => setF({ ...f, formality: x })}>{x}</button>)}</div>
      </div>
      <div className="field"><span>Seasons</span>
        <div className="pills">{SEASONS.map((x) => <button key={x} className={`pill ${(f.seasons || []).includes(x) ? "on" : ""}`} onClick={() => setF({ ...f, seasons: toggle(f.seasons || [], x) })}>{x}</button>)}</div>
      </div>
      <div className="field"><span>Styles it suits</span>
        <div className="pills">{styleNames.map((x) => <button key={x} className={`pill ${(f.styles || []).includes(x) ? "on" : ""}`} onClick={() => setF({ ...f, styles: toggle(f.styles || [], x) })}>{x}</button>)}</div>
      </div>
      <div className="row2">
        <label className="field"><span>Brand</span><input className="in" value={f.brand || ""} onChange={set("brand")} /></label>
        <label className="field"><span>Size</span><input className="in" value={f.size || ""} onChange={set("size")} /></label>
      </div>
      <label className="field"><span>Description</span><textarea className="in" rows={3} value={f.description || ""} onChange={set("description")} /></label>
      <label className="field"><span>My notes</span><textarea className="in" rows={2} value={f.notes || ""} onChange={set("notes")} placeholder="e.g. runs small, needs a cami underneath" /></label>

      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await onSave(item.id, fields(), "Saved"); setBusy(false); }}>
          <Icon name="check" size={18} />Save changes
        </button>
      </div>
      <div className="actions">
        <button className="btn" disabled={busy || !item.image_path} onClick={async () => {
          setBusy(true); const it = await onDescribe(item.id); setBusy(false);
          if (it) setF({ ...it, colors: (it.colors || []).join(", ") });
        }}><Icon name="sparkle" size={18} />{busy ? "Working…" : isUntagged(item) ? "Describe with AI" : "Re-describe"}</button>
        <button className="btn danger" onClick={(e) => { setConfirm(true); e.currentTarget.closest(".sheet")?.scrollTo({ top: 0, behavior: "smooth" }); }}>
          <Icon name="trash" size={18} />Delete</button>
      </div>
    </Sheet>
  );
}
