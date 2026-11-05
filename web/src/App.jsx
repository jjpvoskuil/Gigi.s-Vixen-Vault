import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, configured } from "./supabase.js";
import ClosetScreen from "./ClosetScreen.jsx";
import AddScreen from "./AddScreen.jsx";
import UnlockScreen from "./UnlockScreen.jsx";
import { Dial, Soon, TabBar } from "./Shell.jsx";
import Icon from "./Icon.jsx";
import { demoSeed } from "./demo.js";
import { demoDb, supabaseDb } from "./lib/db.js";

const TAB_IDS = ["closet", "unlock", "add", "me", "more"];

export default function App() {
  const demo = !configured || new URLSearchParams(location.search).has("demo"); // ?demo = made-up data only
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [me, setMe] = useState(undefined);            // app_users row; null = not approved
  const [data, setData] = useState(null);             // {items, styles, profile}
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [looks, setLooks] = useState(null);           // last outfit results (kept across tabs)
  const [openItem, setOpenItem] = useState(null);     // closet item to open when jumping from a look
  const [tab, setTabState] = useState(() => { const h = location.hash.slice(1); return TAB_IDS.includes(h) ? h : "closet"; });
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);
  const go = (id) => { setTabState(id); history.replaceState(null, "", `#${id}`); };

  useEffect(() => {
    if (demo) { setSession({ user: { email: "demo@example.com" } }); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [demo]);

  const db = useMemo(() => (session ? (demo ? demoDb(demoSeed) : supabaseDb(supabase, session.user.email)) : null), [session?.user?.email, demo]);

  const load = useCallback(async () => {
    const [items, styles, profile] = await Promise.all([db.listItems(), db.listStyles(), db.getProfile()]);
    setData({ items, styles, profile });
  }, [db]);

  useEffect(() => {
    if (!db) return;
    (async () => {
      try { const u = await db.whoami(); setMe(u); if (u) await load(); } catch (e) { setError(e.message); }
    })();
  }, [db, load]);

  /** Run a save, report failure, then reload. */
  const save = useCallback(async (fn, ok) => {
    try { await fn(db); await load(); if (ok) setToast(ok); return true; }
    catch (e) { setToast(`Couldn't save — ${e.message}`); return false; }
  }, [db, load]);

  const signIn = () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  const signOut = () => { if (!demo) supabase.auth.signOut(); else location.reload(); };

  if (error) return <Splash><p className="err">Couldn't load: {error}</p><button className="btn" onClick={() => location.reload()}>Try again</button></Splash>;
  if (session === undefined) return <Splash><p className="muted">Unlocking…</p></Splash>;
  if (!session) return (
    <Splash>
      <p className="muted">Private — for Gigi's eyes (and John's).</p>
      <button className="btn dark" onClick={signIn}>Sign in with Google</button>
    </Splash>
  );
  if (me === null) return (
    <Splash>
      <p><b>{session.user.email}</b> isn't on the list.</p>
      <p className="muted">Ask John to add you.</p>
      <button className="btn" onClick={signOut}>Sign out</button>
    </Splash>
  );
  if (!data) return <Splash><p className="muted">Unlocking…</p></Splash>;

  return (
    <>
      {demo && <span className="demo">DEMO</span>}
      {tab === "closet" && (
        <ClosetScreen db={db} openItem={openItem} clearOpenItem={() => setOpenItem(null)} items={data.items} styles={data.styles} onUnlock={() => go("unlock")}
          onSave={(id, fields, ok) => save((d) => d.saveItem(id, fields), ok)}
          onDelete={(item) => save((d) => d.deleteItem(item), "Deleted")}
          onDescribe={async (id) => { try { const it = await db.describeItem(id); await load(); setToast("Described"); return it; } catch (e) { setToast(e.message); return null; } }}
          onDescribeAll={() => go("add")} />
      )}
      {tab === "unlock" && (
        <UnlockScreen db={db} items={data.items} styles={data.styles} profile={data.profile} result={looks} setResult={setLooks}
          onAdd={() => go("add")} onCloset={(id) => { setOpenItem(id); go("closet"); }}
          onWore={(pieces) => save(async (d) => { for (const p of pieces) await d.saveItem(p.id, { times_worn: (p.times_worn || 0) + 1 }); }, "Logged — enjoy!")} />
      )}
      {tab === "add" && <AddScreen db={db} items={data.items} reload={load} onCloset={() => go("closet")} />}
      {tab === "me" && <Soon title="Me" what="Measurements, body photos and your styles." />}
      {tab === "more" && (
        <div className="scroll">
          <Dial />
          <header className="head"><div className="titles"><span className="eyebrow">Gigi's</span><h1 className="title">More</h1></div></header>
          <div style={{ padding: "24px 20px" }}>
            <p className="muted small">Signed in as {session.user.email}</p>
            <button className="btn" onClick={signOut}><Icon name="out" size={18} />Sign out</button>
          </div>
        </div>
      )}
      <TabBar tab={tab} onTab={go} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function Splash({ children }) {
  return (
    <div className="splash">
      <Dial />
      <img src="/icon-512.png" alt="" />
      <span className="eyebrow" style={{ marginTop: 14 }}>Gigi's</span>
      <h1 className="title">Velvet Vault</h1>
      {children}
    </div>
  );
}
