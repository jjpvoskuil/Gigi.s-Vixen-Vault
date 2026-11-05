// Punch list rules — same JSON shape as the Streamlit app (lib/punchlist.py), stored as punch_list.json on the
// repo's "punch-list" branch so Claude (the developer) reads the same list. Plain JS, no imports: the
// vault-punch Edge Function inlines this file.

export const STATUSES = ["Open", "In progress", "Done", "Won't do"];
export const TYPES = ["Bug", "Change", "New idea", "Question"];
export const PRIORITIES = ["High", "Normal", "Low"];
export const PAGES = ["Closet", "Unlock", "Add", "Me – Measurements", "Me – Body photos", "Me – Styles", "Punch List",
  "Sign-in / phone icon", "Other"];
export const EDITABLE = ["title", "details", "type", "page", "priority"];

export const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("");
export const newId = () => hex(4);
export const shotPath = (itemId) => `screenshots/${itemId}-${hex(3)}.jpg`;

export function newItem(fields, shots = [], id = newId(), now = nowIso()) {
  return {
    id, created: now, updated: now,
    type: TYPES.includes(fields.type) ? fields.type : "Change",
    page: fields.page || "Other",
    priority: PRIORITIES.includes(fields.priority) ? fields.priority : "Normal",
    title: String(fields.title || "").trim(),
    details: String(fields.details || "").trim(),
    added_by: fields.added_by || "",
    status: "Open", screenshots: shots, comments: [], dev_notes: "",
  };
}

/** Older items kept one "screenshot"; newer ones a "screenshots" list. */
export function allScreenshots(item) {
  const shots = [...(item.screenshots || [])];
  if (item.screenshot && !shots.includes(item.screenshot)) shots.unshift(item.screenshot);
  return shots;
}

/** Edits text, attaches a screenshot and/or a follow-up note. New info on a finished item reopens it. */
export function applyEdit(items, id, { fields = {}, shot = null, comment = null } = {}, now = nowIso()) {
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error("That punch list item wasn't found — it may have been deleted.");
  for (const k of EDITABLE) if (k in fields) it[k] = typeof fields[k] === "string" ? fields[k].trim() : fields[k];
  if (shot) { it.screenshots = [...allScreenshots(it), shot]; delete it.screenshot; }
  const note = comment && String(comment.text || "").trim();
  if (note) (it.comments ||= []).push({ by: comment.by || "", at: now, text: note });
  if ((shot || note) && ["Done", "Won't do"].includes(it.status)) it.status = "Open";
  it.updated = now;
  return it;
}

export function applyStatus(items, id, status, now = nowIso()) {
  if (!STATUSES.includes(status)) throw new Error("Unknown status");
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error("That punch list item wasn't found — it may have been deleted.");
  it.status = status; it.updated = now;
  return it;
}

/** {open: High first then oldest, closed: newest first} — same order as the Streamlit page. */
export function sortItems(items) {
  const pr = (i) => { const n = PRIORITIES.indexOf(i.priority); return n < 0 ? 1 : n; };
  const isOpen = (i) => ["Open", "In progress"].includes(i.status || "Open");
  const open = items.filter(isOpen).sort((a, b) => pr(a) - pr(b) || String(a.created || "").localeCompare(String(b.created || "")));
  const closed = items.filter((i) => !isOpen(i)).sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")));
  return { open, closed };
}

/** Text ⇄ base64 that keeps emoji and accents intact (GitHub's contents API speaks base64). */
export function textToB64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64ToText(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
/** Same file layout as Python: json.dumps({"items": items}, indent=2, ensure_ascii=False). */
export const fileText = (items) => JSON.stringify({ items }, null, 2);
