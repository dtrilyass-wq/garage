/* Oriented-bounding-box geometry (meters). Ported from v2 and typed. */

export interface OBB {
  cx: number;
  cy: number;
  w: number; // extent across (local x)
  l: number; // extent along (local y)
  rot?: number; // deg
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

export const rad = (d: number): number => (d * Math.PI) / 180;

/** Corners of an OBB. rot 0 = "nose north": local length axis points -y. */
export function cornersOf(o: OBB): Pt[] {
  const a = rad(o.rot || 0);
  const ax = { x: Math.sin(a), y: -Math.cos(a) }; // length axis (nose direction)
  const sd = { x: Math.cos(a), y: Math.sin(a) }; // width axis
  const hw = o.w / 2;
  const hl = o.l / 2;
  const { cx, cy } = o;
  return [
    { x: cx + ax.x * hl + sd.x * hw, y: cy + ax.y * hl + sd.y * hw },
    { x: cx + ax.x * hl - sd.x * hw, y: cy + ax.y * hl - sd.y * hw },
    { x: cx - ax.x * hl - sd.x * hw, y: cy - ax.y * hl - sd.y * hw },
    { x: cx - ax.x * hl + sd.x * hw, y: cy - ax.y * hl + sd.y * hw },
  ];
}

/** Nose direction unit vector of an OBB (rot 0 → north / -y). */
export function noseDir(o: OBB): Pt {
  const a = rad(o.rot || 0);
  return { x: Math.sin(a), y: -Math.cos(a) };
}

/** Width-axis unit vector of an OBB. */
export function sideDir(o: OBB): Pt {
  const a = rad(o.rot || 0);
  return { x: Math.cos(a), y: Math.sin(a) };
}

export function toOBB(r: Rect): OBB {
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, l: r.h, rot: 0 };
}

export function inflate(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
}

function project(cs: Pt[], u: Pt): [number, number] {
  let mn = 1e9;
  let mx = -1e9;
  for (const p of cs) {
    const d = p.x * u.x + p.y * u.y;
    if (d < mn) mn = d;
    if (d > mx) mx = d;
  }
  return [mn, mx];
}

/** Separating-axis overlap test between two OBBs (15 mm tolerance). */
export function obbOverlap(A: OBB, B: OBB, eps = 0.015): boolean {
  const ca = cornersOf(A);
  const cb = cornersOf(B);
  const axes: Pt[] = [];
  for (const cs of [ca, cb]) {
    for (let i = 0; i < 2; i++) {
      const e = { x: cs[(i + 1) % 4].x - cs[i].x, y: cs[(i + 1) % 4].y - cs[i].y };
      const L = Math.hypot(e.x, e.y) || 1;
      axes.push({ x: -e.y / L, y: e.x / L });
    }
  }
  for (const u of axes) {
    const [a1, a2] = project(ca, u);
    const [b1, b2] = project(cb, u);
    if (a2 < b1 + eps || b2 < a1 + eps) return false;
  }
  return true;
}

export function pointInOBB(p: Pt, o: OBB): boolean {
  const a = rad(o.rot || 0);
  const dx = p.x - o.cx;
  const dy = p.y - o.cy;
  const lx = dx * Math.cos(-a) - dy * Math.sin(-a);
  const ly = dx * Math.sin(-a) + dy * Math.cos(-a);
  return Math.abs(lx) <= o.w / 2 && Math.abs(ly) <= o.l / 2;
}

export function aabbOf(o: OBB): Rect {
  const cs = cornersOf(o);
  const xs = cs.map((p) => p.x);
  const ys = cs.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function rectsOverlap(a: Rect, b: Rect, eps = 0.015): boolean {
  return a.x + a.w > b.x + eps && b.x + b.w > a.x + eps && a.y + a.h > b.y + eps && b.y + b.h > a.y + eps;
}

/** Distance from a point to an axis-aligned rect (0 when inside). */
export function distToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Apron (manoeuvring area) in front of the ENTRY side of a stall:
    same width as the stall, `depth` deep, attached to the tail
    (opposite the nose). */
export function entryApron(o: OBB, depth: number): OBB {
  const n = noseDir(o);
  const off = o.l / 2 + depth / 2;
  return { cx: o.cx - n.x * off, cy: o.cy - n.y * off, w: o.w, l: depth, rot: o.rot };
}

/** Side aprons of a parallel stall (both sides — one must be a lane). */
export function sideAprons(o: OBB, depth: number): [OBB, OBB] {
  const sdir = sideDir(o);
  const off = o.w / 2 + depth / 2;
  const mk = (sign: 1 | -1): OBB => ({
    cx: o.cx + sign * sdir.x * off,
    cy: o.cy + sign * sdir.y * off,
    w: depth,
    l: o.l,
    rot: o.rot,
  });
  return [mk(1), mk(-1)];
}

export const snapTo = (v: number, step: number): number => Math.round(v / step) * step;
