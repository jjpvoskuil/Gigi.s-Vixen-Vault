// Pieces every screen shares: the vault-dial backdrop, screen header, leather card, tab bar and sheets.
import { useEffect } from "react";
import Icon from "./Icon.jsx";

export const TABS = [["closet", "Closet", "hanger"], ["unlock", "Unlock", "unlock"], ["add", "Add", "plus"], ["me", "Me", "me"], ["more", "More", "more"]];

export function Dial() {
  return (
    <div className="dialbox" aria-hidden="true"><svg className="dial" viewBox="0 0 420 420">
      <defs><linearGradient id="chrome" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F4F5F7" /><stop offset=".45" stopColor="#A9AEB5" /><stop offset=".55" stopColor="#E3E6EA" /><stop offset="1" stopColor="#7E848C" /></linearGradient></defs>
      <circle cx="210" cy="210" r="200" fill="none" stroke="url(#chrome)" strokeWidth="3" />
      <circle cx="210" cy="210" r="160" fill="none" stroke="#CFC8C6" strokeWidth="10" strokeDasharray="2 14" />
      <circle cx="210" cy="210" r="118" fill="#E2DCDA" />
      <circle cx="210" cy="210" r="60" fill="none" stroke="url(#chrome)" strokeWidth="8" />
    </svg></div>
  );
}

export function Head({ eyebrow = "Gigi's", title, sub, children }) {
  return (
    <header className="head">
      <div className="titles">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="title">{title}</h1>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {children}
    </header>
  );
}

export function Studs({ n = 14 }) {
  return <div className="studs" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} />)}</div>;
}

export function TabBar({ tab, onTab }) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(([id, label, icon]) => id === "add"
        ? <button key={id} className={`tab-add ${tab === id ? "on" : ""}`} aria-label="Add clothes" onClick={() => onTab(id)}><Icon name="plus" /></button>
        : <button key={id} className={`tab ${tab === id ? "on" : ""}`} aria-current={tab === id ? "page" : undefined} onClick={() => onTab(id)}>
            <Icon name={icon} size={24} />{label}
          </button>)}
    </nav>
  );
}

/** Bottom sheet: dims the screen, closes on the veil or Escape. */
export function Sheet({ title, onClose, children, label }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <>
      <div className="veil" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label || title}>
        <div className="grabber" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="round" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
        </div>
        {children}
      </section>
    </>
  );
}

/** Screens not rebuilt yet. */
export function Soon({ title, what }) {
  return (
    <div className="scroll">
      <Dial />
      <Head title={title} />
      <div className="soon">
        <div className="leather">
          <Studs />
          <div className="copy" style={{ maxWidth: "none" }}>
            <span className="kicker">Coming next</span>
            <span className="big">Being moved over</span>
            <span className="note">{what}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
