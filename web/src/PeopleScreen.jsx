// More → People (admins only): who is on the list, add family, and switch to view someone's closet.
// Each person signs in with Google using the email added here and gets their own empty closet.
import { useState } from "react";
import Icon from "./Icon.jsx";
import { Dial, Head } from "./Shell.jsx";

const WEAR = [["womens", "Women's"], ["mens", "Men's"]];

export default function PeopleScreen({ db, people, myEmail, owner, onBack, onView, onWear, reload, toast }) {
  const [f, setF] = useState({ name: "", email: "", role: "member", wear: "womens" });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());

  async function add() {
    setBusy(true);
    try {
      const email = f.email.trim().toLowerCase();
      if (people.some((p) => p.email === email)) throw new Error("That email is already on the list.");
      await db.saveUser({ email, name: f.name, role: f.role });
      await onWear(email, f.wear);
      await reload();
      toast(`Added ${f.name.trim() || email}`);
      setF({ name: "", email: "", role: "member", wear: "womens" });
    } catch (e) { toast(e.message); }
    setBusy(false);
  }

  async function remove(p) {
    try { await db.deleteUser(p.email); await reload(); toast(`Removed ${p.name || p.email}`); if (owner === p.email) onView(""); }
    catch (e) { toast(e.message); }
    setConfirm("");
  }

  return (
    <div className="scroll">
      <Dial />
      <Head eyebrow="More" title="People" sub="Everyone has their own closet">
        <button className="round" aria-label="Back" onClick={onBack}><Icon name="back" size={20} /></button>
      </Head>
      <div className="pad">
        <ul className="people">
          {people.map((p) => (
            <li key={p.email} className={owner === p.email ? "on" : ""}>
              <div>
                <b>{p.name || p.email.split("@")[0]}{p.email === myEmail && " (you)"}</b>
                <span className="small muted">{p.email}{p.role === "admin" ? " · admin" : ""}</span>
              </div>
              {owner === p.email ? <span className="small" style={{ color: "var(--good)" }}>✓ showing</span>
                : <button className="pill" onClick={() => onView(p.email)}>View closet</button>}
              {p.email !== myEmail && (confirm === p.email
                ? <button className="pill danger" onClick={() => remove(p)}>Remove?</button>
                : <button className="round small" aria-label={`Remove ${p.name || p.email}`} onClick={() => setConfirm(p.email)}><Icon name="trash" size={16} /></button>)}
            </li>
          ))}
        </ul>
        <p className="small muted">Removing someone stops them signing in. Their closet stays saved and comes back if you add them again.</p>

        <h3 className="minor">Add someone</h3>
        <label className="field"><span>First name</span><input className="in" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Alex" /></label>
        <label className="field"><span>Their Google email</span><input className="in" type="email" inputMode="email" autoCapitalize="none" value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="the address they sign in to Google with" /></label>
        <div className="field"><span>Clothes</span>
          <div className="pills">{WEAR.map(([v, l]) => <button key={v} className={`pill ${f.wear === v ? "on" : ""}`} onClick={() => setF({ ...f, wear: v })}>{l}</button>)}</div>
        </div>
        <div className="field"><span>Can see everyone's closet?</span>
          <div className="pills">
            <button className={`pill ${f.role === "member" ? "on" : ""}`} onClick={() => setF({ ...f, role: "member" })}>No — just their own</button>
            <button className={`pill ${f.role === "admin" ? "on" : ""}`} onClick={() => setF({ ...f, role: "admin" })}>Yes (admin)</button>
          </div>
        </div>
        <button className="btn primary wide" disabled={!valid || busy} onClick={add}><Icon name="plus" size={18} />{busy ? "Adding…" : "Add to the vault"}</button>
        <p className="small muted" style={{ marginTop: 10 }}>Then send them the app link. They tap “Sign in with Google” with that email and start with an empty closet.</p>
      </div>
    </div>
  );
}
