// Stroke icons used across the app (24×24).
const P = {
  hanger: <><path d="M12 7a2 2 0 1 1 2-2" /><path d="M14 5c0 1.2-2 1.6-2 3v1" /><path d="M12 9 3 16h18z" /></>,
  unlock: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  me: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  more: <><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  sparkle: <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />,
  check: <path d="M5 12l4 4 10-10" />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  chev: <path d="M9 6l6 6-6 6" />,
  out: <><path d="M15 4h4v16h-4" /><path d="M10 17l5-5-5-5M15 12H4" /></>,
};

export default function Icon({ name, size = 22, className = "icon", ...rest }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>{P[name]}</svg>;
}
