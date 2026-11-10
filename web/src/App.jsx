import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, configured } from "./supabase.js";
import ClosetScreen from "./ClosetScreen.jsx";
import AddScreen from "./AddScreen.jsx";
import UnlockScreen from "./UnlockScreen.jsx";
import MeScreen from "./MeScreen.jsx";
import PunchScreen from "./PunchScreen.jsx";
import ShopScreen from "./ShopScreen.jsx";
import { Dial, Head, TabBar } from "./Shell.jsx";
import Icon from "./Icon.jsx";
import { demoSeed } from "./demo.js";
import { demoDb, supabaseDb } from "./lib/db.js";

const TAB_IDS = ["closet", "unlock", "add", "me", "more"];

// When this copy was built (vite.config.js) — so you can tell the phone has the latest version.
const BUILT = typeof __BUILD__ === "undefined" ? "(dev)" : __BUILD__;

export default function App() {
  const demo = !configured || new URLSearchParams(location.search).has("demo"); // ?demo = made-up data only
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [me, setMe] = useState(undefined);            // app_users row; null = not approved
  const [data, setData] = useState(null);             // {items, styles, profile}
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [moreView, setMoreView] = useState("menu");     // More tab: "menu" | "punch"
  const [looks, setLooks] = useState(null);
  const [ideas, setIdeas] = useState(null);           // last shopping suggestions (kept across tabs)           // last outfit results (kept across tabs)
  const [tab, setTabState] = useState(() => { const h = location.hash.slice(1); return TAB_IDS.includes(h) ? h : "closet"; });
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);
  const go = (id) => { if (id === "more" && tab === "more") setMoreView("menu"); setTabState(id); history.replaceState(null, "", `#${id}`); };

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

  // What the item sheet can do — shared by Closet and Unlock.
  const itemActions = {
    onSave: (id, fields, ok) => save((d) => d.saveItem(id, fields), ok),
    onDelete: (item) => save((d) => d.deleteItem(item), "Deleted"),
    onDeleteMany: (list) => save(async (d) => { for (const it of list) await d.deleteItem(it); }, `Deleted ${list.length} piece${list.length === 1 ? "" : "s"}`),
    onDescribe: async (id) => { try { const it = await db.describeItem(id); await load(); setToast("Described"); return it; } catch (e) { setToast(e.message); return null; } },
  };

  // Return to this app's own folder (e.g. https://jjpvoskuil.github.io/Gigi.s-Vixen-Vault/), not the bare site root.
  const signIn = () => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + import.meta.env.BASE_URL } });
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
        <ClosetScreen db={db} items={data.items} styles={data.styles} onUnlock={() => go("unlock")}
          {...itemActions}
          onDescribeAll={() => go("add")} />
      )}
      {tab === "unlock" && (
        <UnlockScreen db={db} items={data.items} styles={data.styles} profile={data.profile} result={looks} setResult={setLooks}
          onAdd={() => go("add")} {...itemActions}
          onWish={async (w) => { try { await db.addWish(w); setToast("Added to your shopping list"); return true; } catch (e) { setToast(e.message); return false; } }}
          onShop={() => { setMoreView("shop"); go("more"); }}
          onWore={(pieces) => save(async (d) => { for (const p of pieces) await d.saveItem(p.id, { times_worn: (p.times_worn || 0) + 1 }); }, "Logged — enjoy!")} />
      )}
      {tab === "add" && <AddScreen db={db} items={data.items} reload={load} onCloset={() => go("closet")} />}
      {tab === "me" && <MeScreen db={db} profile={data.profile} styles={data.styles} items={data.items} save={save} />}
      {tab === "more" && moreView === "punch" && <PunchScreen db={db} user={session.user} onBack={() => setMoreView("menu")} toast={setToast} />}
      {tab === "more" && moreView === "shop" && (
        <ShopScreen db={db} items={data.items} styles={data.styles} profile={data.profile} result={ideas} setResult={setIdeas}
          onBack={() => setMoreView("menu")} onAdd={() => go("add")} toast={setToast} />
      )}
      {tab === "more" && moreView === "menu" && (
        <div className="scroll">
          <Dial />
          <Head title="More" />
          <ul className="menu">
            <li><button onClick={() => setMoreView("shop")}><Icon name="bag" size={22} />
              <span><b>Shop the gaps</b><em>Pieces & colors to buy that work with your closet</em></span><Icon name="chev" size={18} /></button></li>
            <li><button onClick={() => setMoreView("punch")}><Icon name="list" size={22} />
              <span><b>Punch list</b><em>Bugs, changes & ideas for Claude to work on</em></span><Icon name="chev" size={18} /></button></li>
            <li><button onClick={signOut}><Icon name="out" size={22} />
              <span><b>Sign out</b><em>{session.user.email}</em></span></button></li>
          </ul>
          <p className="built">App updated {BUILT}{demo ? " · demo data" : ""}</p>
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
      <img src={`${import.meta.env.BASE_URL}icon-512.png`} alt="" />
      <span className="eyebrow" style={{ marginTop: 14 }}>Gigi's</span>
      <h1 className="title">Velvet Vault</h1>
      {children}
      <p className="built">App updated {BUILT}</p>
    </div>
  );
}
