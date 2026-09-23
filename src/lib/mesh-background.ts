/**
 * Procedural "gradient mesh" background — reproduces the *style* of the
 * reference image (soft blobs of color in four rough zones: a cool corner,
 * a bright highlight corner, a pale midtone, and a warm corner) as layered
 * CSS radial-gradients, rather than shipping the image itself. Several
 * color families are defined so the result isn't locked to the original
 * image's exact greens/yellows, and the whole thing picks a new theme +
 * layout once per calendar day, seeded from the date — same look all day,
 * different the next.
 *
 * Each theme also carries three accent colors — `accent` (headings, the
 * "connecting" state) and `accentKo`/`accentZh` (the two speaker avatars) —
 * chosen to read clearly against that theme's particular background
 * instead of being fixed colors that might clash with whichever theme is
 * showing.
 */

interface PaletteTheme {
  topLeft: readonly string[];
  topRight: readonly string[];
  middle: readonly string[];
  bottom: readonly string[];
  accent: string;
  accentKo: string;
  accentZh: string;
}

export interface MeshTheme {
  background: string;
  accent: string;
  accentKo: string;
  accentZh: string;
}

// Each theme keeps the reference image's structure (cool corner / bright
// highlight corner / pale mid / warm corner) but draws from a different
// hue family, so daily rotation feels like a set of coordinated looks
// rather than random colors.
const PALETTE_THEMES: readonly PaletteTheme[] = [
  {
    // meadow — the original reference image: mint/green + yellow
    topLeft: ["#bbf7d0", "#86efac", "#d9f99d"],
    topRight: ["#ffffff", "#f7fee7", "#d9f99d"],
    middle: ["#dbeafe", "#e0f2fe", "#bfdbfe"],
    bottom: ["#fde047", "#fef08a", "#bef264"],
    accent: "#4c1d95",
    accentKo: "#2563eb",
    accentZh: "#dc2626",
  },
  {
    // sunset — pink/orange/purple
    topLeft: ["#fbcfe8", "#f9a8d4", "#fda4af"],
    topRight: ["#ffffff", "#fff7ed", "#fed7aa"],
    middle: ["#ddd6fe", "#e9d5ff", "#c4b5fd"],
    bottom: ["#fdba74", "#fca5a5", "#fed7aa"],
    accent: "#701a75",
    accentKo: "#7c3aed",
    accentZh: "#ea580c",
  },
  {
    // ocean — teal/cyan/indigo
    topLeft: ["#99f6e4", "#5eead4", "#a5f3fc"],
    topRight: ["#ffffff", "#ecfeff", "#bae6fd"],
    middle: ["#c7d2fe", "#a5b4fc", "#93c5fd"],
    bottom: ["#67e8f9", "#7dd3fc", "#38bdf8"],
    accent: "#9a3412",
    accentKo: "#4338ca",
    accentZh: "#0d9488",
  },
  {
    // dawn — violet/gold
    topLeft: ["#ddd6fe", "#c4b5fd", "#e9d5ff"],
    topRight: ["#ffffff", "#fef9c3", "#fde68a"],
    middle: ["#bfdbfe", "#dbeafe", "#c7d2fe"],
    bottom: ["#fcd34d", "#fbbf24", "#fdba74"],
    accent: "#312e81",
    accentKo: "#7c3aed",
    accentZh: "#d97706",
  },
  {
    // coral — warm red/orange/pink with a cool mid
    topLeft: ["#fecaca", "#fca5a5", "#fdba74"],
    topRight: ["#ffffff", "#fff1f2", "#fecdd3"],
    middle: ["#a5f3fc", "#bae6fd", "#e0f2fe"],
    bottom: ["#fb923c", "#f87171", "#fbbf24"],
    accent: "#1e3a8a",
    accentKo: "#0891b2",
    accentZh: "#dc2626",
  },
  {
    // lagoon — sky blue throughout with a soft green wave band
    topLeft: ["#7dd3fc", "#38bdf8", "#bae6fd"],
    topRight: ["#ffffff", "#f0f9ff", "#bae6fd"],
    middle: ["#86efac", "#a3e635", "#bef264"],
    bottom: ["#7dd3fc", "#e0f2fe", "#ffffff"],
    accent: "#92400e",
    accentKo: "#2563eb",
    accentZh: "#16a34a",
  },
  {
    // citrus — pale blue with soft yellow blobs and a mint accent
    topLeft: ["#93c5fd", "#bfdbfe", "#dbeafe"],
    topRight: ["#fef9c3", "#fde68a", "#fef08a"],
    middle: ["#ffffff", "#eff6ff", "#dbeafe"],
    bottom: ["#99f6e4", "#5eead4", "#bfdbfe"],
    accent: "#3730a3",
    accentKo: "#2563eb",
    accentZh: "#d97706",
  },
  {
    // peach — coral/pink into orange and yellow, no cool corner
    topLeft: ["#fda4af", "#f472b6", "#fb7185"],
    topRight: ["#fed7aa", "#fff7ed", "#fdba74"],
    middle: ["#fb923c", "#f97316", "#fda4af"],
    bottom: ["#fde047", "#fef08a", "#fbbf24"],
    accent: "#0f766e",
    accentKo: "#e11d48",
    accentZh: "#ea580c",
  },
  {
    // prism — saturated, more of a full-spectrum sweep (green/blue/orange/pink)
    topLeft: ["#4ade80", "#22c55e", "#a3e635"],
    topRight: ["#fde047", "#fef3c7", "#fbbf24"],
    middle: ["#60a5fa", "#3b82f6", "#818cf8"],
    bottom: ["#fb923c", "#f472b6", "#f97316"],
    accent: "#86198f",
    accentKo: "#2563eb",
    accentZh: "#c026d3",
  },
];

interface Blob {
  color: string;
  x: number; // % from left
  y: number; // % from top
  spread: number; // % radius before fading to transparent
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function randomBetween(rng: () => number, min: number, max: number): number {
  return rng() * (max - min) + min;
}

function randomBlob(
  rng: () => number,
  colors: readonly string[],
  xRange: [number, number],
  yRange: [number, number]
): Blob {
  return {
    color: pick(rng, colors),
    x: randomBetween(rng, ...xRange),
    y: randomBetween(rng, ...yRange),
    spread: randomBetween(rng, 55, 85),
  };
}

function blobsToCss(blobs: Blob[]): string {
  const layers = blobs.map(
    (b) =>
      `radial-gradient(circle at ${b.x.toFixed(0)}% ${b.y.toFixed(0)}%, ${b.color} 0%, transparent ${b.spread.toFixed(0)}%)`
  );
  return [...layers, "linear-gradient(180deg, #f7fee7, #eff6ff)"].join(", ");
}

/** Deterministic PRNG (mulberry32) so a given seed always produces the same layout. */
function createSeededRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function generateSeededMeshTheme(seed: number): MeshTheme {
  const rng = createSeededRng(seed);
  const theme = pick(rng, PALETTE_THEMES);
  const blobs = [
    randomBlob(rng, theme.topLeft, [0, 30], [0, 25]),
    randomBlob(rng, theme.topRight, [60, 95], [0, 25]),
    randomBlob(rng, theme.middle, [30, 65], [35, 60]),
    randomBlob(rng, theme.bottom, [5, 40], [75, 100]),
    randomBlob(rng, theme.bottom, [55, 90], [70, 100]),
  ];
  return {
    background: blobsToCss(blobs),
    accent: theme.accent,
    accentKo: theme.accentKo,
    accentZh: theme.accentZh,
  };
}

/**
 * Today's background + accent colors — same theme/layout for the whole
 * calendar day (seeded from the date), a different one tomorrow. Only ever
 * call this client-side (e.g. from a `useEffect`, not during render):
 * seeding from "today" is still a moment-dependent input, and using it
 * directly in a render that gets server-rendered risks the same
 * server/client hydration mismatch as `Date.now()` or `Math.random()` would.
 */
export function generateDailyMeshTheme(date: Date = new Date()): MeshTheme {
  const dayKey = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return generateSeededMeshTheme(hashStringToSeed(dayKey));
}

/**
 * A fresh random theme (new background + accent colors) on every call —
 * for previewing the range of looks by just refreshing the page. Same
 * client-only-call rule as `generateDailyMeshTheme`.
 */
export function generateRandomMeshTheme(): MeshTheme {
  return generateSeededMeshTheme(Math.floor(Math.random() * 2 ** 31));
}

// Fixed first-paint theme (no date/time/randomness involved) so the
// server-rendered HTML and the client's first render match exactly —
// matches the "meadow" theme above.
export const INITIAL_MESH_THEME: MeshTheme = {
  background: blobsToCss([
    { color: "#bbf7d0", x: 12, y: 12, spread: 68 },
    { color: "#ffffff", x: 82, y: 10, spread: 62 },
    { color: "#dbeafe", x: 48, y: 48, spread: 78 },
    { color: "#fde047", x: 20, y: 92, spread: 82 },
    { color: "#bef264", x: 78, y: 85, spread: 70 },
  ]),
  accent: "#4c1d95",
  accentKo: "#2563eb",
  accentZh: "#dc2626",
};
