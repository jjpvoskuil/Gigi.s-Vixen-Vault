// Phone photos → the two JPEGs the vault stores, shrunk on the phone before upload
// (same sizes as the Python app: 2000 px long edge for viewing/AI, 480 px thumbnail for grids).
export const FULL = 2000;
export const THUMB = 480;

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* fall back below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function toJpeg(src, longEdge, quality) {
  const w0 = src.width, h0 = src.height;
  const s = Math.min(1, longEdge / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); // transparent PNGs get a white ground, like the Python app
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't convert the photo"))), "image/jpeg", quality));
}

/** {full, thumb} JPEG blobs. Throws a plain-English error for formats the phone's browser can't open. */
export async function preparePhoto(file) {
  let img;
  try { img = await decode(file); }
  catch { throw new Error("This photo format can't be opened here — try a JPEG or take it with the camera button."); }
  return { full: await toJpeg(img, FULL, 0.9), thumb: await toJpeg(img, THUMB, 0.82) };
}

/** Storage path like the Python app: items/20261105-1a2b3c4d5e6f.jpg (+ _thumb.jpg). */
export function photoStem(folder) {
  const d = new Date();
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${folder}/${day}-${rnd}`;
}
