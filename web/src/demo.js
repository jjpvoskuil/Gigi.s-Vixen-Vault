// Made-up closet for trying the app before Supabase is connected (?demo). Not Gigi's real clothes.
const SHAPES = {
  top: '<path d="M30 20 L42 14 Q50 22 58 14 L70 20 L86 34 L76 44 L70 40 L70 100 L30 100 L30 40 L24 44 L14 34 Z" fill="F"/>',
  bottom: '<path d="M32 14 L68 14 L72 104 L56 104 L50 46 L44 104 L28 104 Z" fill="F"/>',
  dress: '<path d="M40 12 L60 12 L58 30 L66 44 L80 104 L20 104 L34 44 L42 30 Z" fill="F"/>',
  sweater: '<path d="M28 18 L42 14 Q50 20 58 14 L72 18 L90 70 L80 74 L70 46 L70 102 L30 102 L30 46 L20 74 L10 70 Z" fill="F"/>',
  shoes: '<path d="M14 92 L18 66 Q34 58 50 74 L84 84 Q92 87 90 96 L56 96 L30 80 L24 96 L20 96 Z" fill="F"/>',
  bag: '<path d="M38 44 Q50 12 62 44" fill="none" stroke="F" stroke-width="5"/><path d="M24 44 L76 44 L82 100 L18 100 Z" fill="F"/>',
  outerwear: '<path d="M30 16 L44 12 L50 30 L56 12 L70 16 L88 40 L80 48 L72 40 L72 104 L28 104 L28 40 L20 48 L12 40 Z" fill="F"/><path d="M50 30 L50 104" stroke="#0003" stroke-width="2"/>',
};
SHAPES.other = SHAPES.top;
const svg = (cat, fill, tile) => "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -10 140 150"><rect x="-20" y="-10" width="140" height="150" fill="${tile}"/><g style="filter:drop-shadow(0 6px 5px rgba(0,0,0,.25))">${(SHAPES[cat] || SHAPES.top).replaceAll('"F"', `"${fill}"`)}</g></svg>`);

const RAW = [
  ["Leather bustier top", "top", "bustier", "black", ["black"], "leather", ["Edgy", "Date Night"], ["fall", "winter"], "dressy", true, 4, "#1A1214", "#E4DFDE"],
  ["Oxblood satin slip dress", "dress", "slip dress", "oxblood", ["oxblood"], "satin", ["Date Night"], ["spring", "summer"], "dressy", true, 2, "#7D0A1E", "#EBE0E0"],
  ["Buckled stilettos", "shoes", "heels", "black", ["black", "silver"], "patent leather", ["Date Night", "Edgy"], ["fall", "winter", "spring"], "dressy", false, 0, "#140D0F", "#E2DDDC"],
  ["Wet-look leggings", "bottom", "leggings", "black", ["black"], "faux leather", ["Edgy", "Casual Chic"], ["fall", "winter"], "casual", false, 6, "#231A1C", "#E6E1E0"],
  ["Lace-trim cami", "top", "camisole", "plum", ["plum", "black"], "silk", ["Date Night", "Romantic"], ["summer"], "smart casual", false, 3, "#4A1F45", "#EAE2E8"],
  ["Light-wash high-rise jeans", "bottom", "jeans", "light blue", ["light blue"], "denim", ["Casual Chic", "Lake Life"], ["spring", "summer", "fall"], "casual", true, 11, "#7FA1C6", "#E8ECF1"],
  ["Navy striped tee", "top", "t-shirt", "navy", ["navy", "white"], "cotton", ["Casual Chic", "Coastal / Nautical"], ["summer"], "casual", false, 9, "#2F3A56", "#E9ECF3"],
  ["Camel cable-knit sweater", "sweater", "pullover", "camel", ["camel"], "wool", ["Cozy Fall", "Classic"], ["fall", "winter"], "casual", false, 5, "#C9A27E", "#F2EBE4"],
  ["Black moto jacket", "outerwear", "moto jacket", "black", ["black", "silver"], "leather", ["Edgy"], ["fall", "spring"], "smart casual", true, 7, "#1C1416", "#E3DEDD"],
  ["Tan leather crossbody", "bag", "crossbody", "tan", ["tan"], "leather", ["Casual Chic"], ["spring", "summer", "fall"], "casual", false, 8, "#B07A4E", "#EFE7E0"],
  ["Red wrap midi dress", "dress", "wrap dress", "red", ["red"], "jersey", ["Date Night", "Romantic"], ["spring", "summer"], "smart casual", false, 1, "#B3122E", "#F1E3E4"],
  ["White linen button-down", "top", "shirt", "white", ["white"], "linen", ["Lake Life", "Classic"], ["summer"], "casual", false, 4, "#F4F1EC", "#E2DEDB"],
  ["Black lace bodysuit", "top", "bodysuit", "black", ["black"], "lace", ["Date Night", "Edgy"], ["fall", "winter", "spring"], "dressy", false, 2, "#18110F", "#E7E1E1"],
  ["Studded ankle boots", "shoes", "ankle boots", "black", ["black", "silver"], "leather", ["Edgy", "Western / Country"], ["fall", "winter"], "casual", false, 6, "#1E1517", "#E4DFDD"],
];

export function demoSeed() {
  const photos = {};
  const items = RAW.map((r, n) => {
    const id = `demo-${n}`;
    photos[`items/${id}.jpg`] = svg(r[1], r[11], r[12]);
    photos[`items/${id}_thumb.jpg`] = photos[`items/${id}.jpg`];
    return { id, created_at: new Date(Date.UTC(2026, 10, 5) - n * 36e5).toISOString(), name: r[0], category: r[1], subcategory: r[2],
      primary_color: r[3], colors: r[4], material: r[5], styles: r[6], seasons: r[7], formality: r[8], favorite: r[9],
      times_worn: r[10], pattern: r[5] === "lace" ? "lace" : "solid", fit: "", brand: "", size: "", notes: "",
      description: `${r[0]} — pairs well with ${r[1] === "bottom" ? "a fitted top" : "dark denim or a pencil skirt"}.`,
      image_path: `items/${id}.jpg`, thumb_path: `items/${id}_thumb.jpg` };
  });
  // two undescribed pieces, like real uploads where the AI step failed
  items.push({ id: "demo-u1", created_at: "2026-10-01T12:00:00Z", name: "New item", category: "other", description: "",
    colors: [], styles: [], seasons: [], favorite: false, times_worn: 0, image_path: "items/demo-u1.jpg", thumb_path: "items/demo-u1_thumb.jpg" });
  photos["items/demo-u1.jpg"] = photos["items/demo-u1_thumb.jpg"] = svg("top", "#6E6466", "#E6E1E0");
  return {
    users: [{ email: "demo@example.com", name: "Demo", role: "admin" }],
    items, photos,
    profile: { id: 1, measurements: { height: 65.5, bust: 36, waist: 29.5, hips: 39 }, sizes: { tops: "M", bottoms: "8" },
      my_styles: ["Date Night", "Edgy", "Casual Chic"], fit_notes: "", color_notes: "" },
    styles: ["Casual Chic", "Relaxed Weekend", "Lake Life", "Athleisure", "Smart Casual", "Boho", "Coastal / Nautical",
      "Western / Country", "Classic", "Minimalist", "Romantic", "Edgy", "Preppy", "Business Casual", "Date Night",
      "Dressy / Event", "Cozy Fall", "Monochrome", "Bold & Colorful", "Vintage-Inspired"].map((name, i) => ({ name, description: "", custom: false, sort_order: i + 1 })),
    body: [],
  };
}
