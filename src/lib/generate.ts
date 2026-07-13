/* =====================================================================
   Scenario generator — computes realistic, safe parking layouts for the
   CURRENT garage envelope + structure.

   Method (all in meters):
   1. Supports = wall faces stalls can back onto: S wall, south faces of
      thin interior walls, N wall, W wall, E wall (priority in that order).
   2. Reserved floor = structure, doors (+30 cm), the exit lane and the
      entry corridor below the lane gap — no stall bodies there.
   3. Each support is filled with 90° stalls: free segments are computed
      by interval subtraction (including obstacles in the apron band, so
      stalls align BETWEEN columns), widths get +30 cm against walls or
      columns, leftovers become compacts (max profile only).
   4. Every stall must keep a manoeuvring apron in front of its entry
      side (5.00 m; the max profile accepts 4.60 m and flags the stall
      as "tight"). Where 90° fails, parallel stalls (2.20 deep, one-way
      3.00 m lane) are tried instead.
   5. A reachability check (0.25 m grid, 0.90 m vehicle half-clearance,
      BFS from the exit opening) drops any stall a car cannot reach.
   6. Comfort profiles convert the stall pair nearest the stair door
      into one accessible (PMR) stall.
   ===================================================================== */

import {
  RULES,
  type FlowArrow,
  type GarageSpec,
  type Stall,
  type StructItem,
} from "./model";
import {
  aabbOf,
  cornersOf,
  entryApron,
  obbOverlap,
  rectsOverlap,
  sideAprons,
  type OBB,
  type Rect,
  distToRect,
} from "./geom";

export type ProfileId = "max" | "comfort" | "suv";

interface Profile {
  id: ProfileId;
  stdW: number;
  depth: number;
  tpMain: "std" | "suv";
  aisle: number; // required clear apron in front of 90° stalls
  aisleFlag: number | null; // reduced apron accepted with a "tight" flag
  aislePara: number; // lane beside parallel stalls
  compactFill: boolean;
  pmr: boolean;
}

export const PROFILES: Record<ProfileId, Profile> = {
  max: {
    id: "max",
    stdW: 2.5,
    depth: 5.0,
    tpMain: "std",
    aisle: 5.0,
    aisleFlag: 4.6,
    aislePara: 3.0,
    compactFill: true,
    pmr: false,
  },
  comfort: {
    id: "comfort",
    stdW: 2.6,
    depth: 5.0,
    tpMain: "std",
    aisle: 5.5,
    aisleFlag: null,
    aislePara: 3.2,
    compactFill: false,
    pmr: true,
  },
  suv: {
    id: "suv",
    stdW: 2.8,
    depth: 5.4,
    tpMain: "suv",
    aisle: 5.5,
    aisleFlag: null,
    aislePara: 3.2,
    compactFill: false,
    pmr: true,
  },
};

const SMALL = { w: 2.2, l: 4.3 };
const PARA = { w: 2.2, l: 5.5 };
const PARA_SMALL = { w: 2.15, l: 4.5 };
const REACH_CELL = 0.25;
const REACH_R = 0.9; // vehicle half-clearance

interface Support {
  name: string;
  axis: "h" | "v"; // h: along x (u = x, v = y), v: along y (u = y, v = x)
  pos: number; // v of the wall face
  from: number;
  to: number;
  dir: 1 | -1; // stalls extend toward +v (1) or -v (-1)
}

interface Segment {
  a: number;
  b: number;
  aSolid: boolean;
  bSolid: boolean;
}

export interface GenStats {
  cars: number;
  flagged: number;
  pmr: boolean;
  dropped: number;
}

export interface GenResult {
  stalls: Stall[];
  flow: FlowArrow[];
  stats: GenStats;
}

/* ---------- rect helpers in support (u, v) coordinates ---------- */

function rectUV(sup: Support, r: Rect): { u0: number; u1: number; v0: number; v1: number } {
  return sup.axis === "h"
    ? { u0: r.x, u1: r.x + r.w, v0: r.y, v1: r.y + r.h }
    : { u0: r.y, u1: r.y + r.h, v0: r.x, v1: r.x + r.w };
}

function uvRect(sup: Support, u0: number, u1: number, v0: number, v1: number): Rect {
  const a = Math.min(v0, v1);
  const b = Math.max(v0, v1);
  return sup.axis === "h"
    ? { x: u0, y: a, w: u1 - u0, h: b - a }
    : { x: a, y: u0, w: b - a, h: u1 - u0 };
}

function structRect(s: StructItem): Rect {
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}

/* ---------- generation context ---------- */

interface Ctx {
  spec: GarageSpec;
  P: Profile;
  hard: Rect[]; // structure that blocks bodies AND aprons
  bodyReserved: Rect[]; // hard + doors + lane + corridor (blocks bodies only)
  lane: Rect;
  corridor: Rect | null;
  topRoad: boolean;
  placed: PlacedStall[];
  seq: number;
}

interface PlacedStall extends Stall {
  supName: string;
  u: number; // center along support axis
  apronDepth: number; // apron depth this stall was validated with
  apron: OBB;
}

function garageRect(spec: GarageSpec): Rect {
  return { x: 0, y: 0, w: spec.W, h: spec.H };
}

function outOfBounds(o: OBB, spec: GarageSpec): boolean {
  for (const c of cornersOf(o)) {
    if (c.x < -0.02 || c.y < -0.02 || c.x > spec.W + 0.02 || c.y > spec.H + 0.02) return true;
  }
  return false;
}

function apronClear(ctx: Ctx, apron: OBB): boolean {
  if (outOfBounds(apron, ctx.spec)) return false;
  for (const r of ctx.hard) if (obbOverlap(apron, { ...toObbRect(r) })) return false;
  if (obbOverlap(apron, toObbRect(ctx.lane))) return false;
  for (const p of ctx.placed) if (obbOverlap(apron, p)) return false;
  return true;
}

function toObbRect(r: Rect): OBB {
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, w: r.w, l: r.h, rot: 0 };
}

/** Overlap extent of a rect-ish OBB with an apron, measured along the
    apron's depth axis. Used to tolerate shallow parallel stalls at the
    edge of a 90° apron (flagging both) the way the surveyed plan does. */
function apronOverlapDepth(apron: OBB, body: OBB): number {
  if (!obbOverlap(apron, body)) return 0;
  const aa = aabbOf(apron);
  const bb = aabbOf(body);
  // aprons here are axis-aligned (rot multiple of 90°)
  const ox = Math.min(aa.x + aa.w, bb.x + bb.w) - Math.max(aa.x, bb.x);
  const oy = Math.min(aa.y + aa.h, bb.y + bb.h) - Math.max(aa.y, bb.y);
  // depth axis = the shorter apron dimension direction? Use the axis of
  // the apron's depth: apron.l is its depth along the nose axis.
  const vertical = Math.abs(Math.sin((apron.rot || 0) * (Math.PI / 180))) < 0.5;
  return vertical ? oy : ox;
}

/* ---------- supports ---------- */

function supportsOf(spec: GarageSpec, structure: StructItem[]): Support[] {
  const sups: Support[] = [];
  sups.push({ name: "S", axis: "h", pos: spec.H, from: 0, to: spec.W, dir: -1 });
  // south faces of thin interior walls wide enough to back stalls onto
  for (const it of structure) {
    if (it.type === "wall" && it.w >= 2.2 && it.h <= 0.6) {
      sups.push({ name: "F" + it.id, axis: "h", pos: it.y + it.h, from: it.x, to: it.x + it.w, dir: 1 });
    }
  }
  sups.push({ name: "N", axis: "h", pos: 0, from: 0, to: spec.W, dir: 1 });
  sups.push({ name: "W", axis: "v", pos: 0, from: 0, to: spec.H, dir: 1 });
  sups.push({ name: "E", axis: "v", pos: spec.W, from: 0, to: spec.H, dir: -1 });
  return sups;
}

/** Align stall heads with a line of free-standing columns just in front
    (like the surveyed south row: heads flush with the column faces). */
function snapDepthToColumns(sup: Support, depth: number, structure: StructItem[]): number {
  const cols = structure.filter((s) => s.type === "col");
  if (sup.axis !== "h") return depth; // only meaningful for long rows here
  const head = sup.pos + sup.dir * depth;
  let snapped = depth;
  let hits = 0;
  for (const c of cols) {
    const uv = rectUV(sup, structRect(c));
    if (uv.u1 < sup.from || uv.u0 > sup.to) continue;
    if (sup.dir === -1) {
      // stalls extend up; columns just above the head line
      if (uv.v1 >= head - 1.3 && uv.v1 <= head + 0.01) {
        hits++;
        snapped = Math.max(snapped, sup.pos - uv.v1);
      }
    } else {
      if (uv.v0 <= head + 1.3 && uv.v0 >= head - 0.01) {
        hits++;
        snapped = Math.max(snapped, uv.v0 - sup.pos);
      }
    }
  }
  return hits >= 2 ? snapped : depth;
}

/* ---------- free segments along a support ---------- */

function freeSegments(
  ctx: Ctx,
  sup: Support,
  depth: number,
  apronDepth: number,
  includePlaced: boolean
): Segment[] {
  const { spec } = ctx;
  const head = sup.pos + sup.dir * depth;
  const back = sup.pos;
  const stripV0 = Math.min(back, head);
  const stripV1 = Math.max(back, head);
  const apronV0 = Math.min(head, head + sup.dir * apronDepth);
  const apronV1 = Math.max(head, head + sup.dir * apronDepth);

  // strip must be inside the garage
  if (stripV0 < -0.01 || stripV1 > (sup.axis === "h" ? spec.H : spec.W) + 0.01) return [];

  const blockers: Array<{ u0: number; u1: number }> = [];
  const addBlock = (r: Rect, v0: number, v1: number) => {
    const uv = rectUV(sup, r);
    if (uv.v1 <= v0 + 0.01 || uv.v0 >= v1 - 0.01) return;
    if (uv.u1 <= sup.from || uv.u0 >= sup.to) return;
    blockers.push({ u0: Math.max(sup.from, uv.u0), u1: Math.min(sup.to, uv.u1) });
  };

  for (const r of ctx.bodyReserved) addBlock(r, stripV0, stripV1);
  // obstacles standing in the apron band split the row (stalls align between columns)
  for (const r of ctx.hard) addBlock(r, apronV0, apronV1);
  if (includePlaced) for (const p of ctx.placed) addBlock(aabbOf(p), stripV0, stripV1);

  blockers.sort((a, b) => a.u0 - b.u0);
  const merged: Array<{ u0: number; u1: number }> = [];
  for (const b of blockers) {
    const last = merged[merged.length - 1];
    if (last && b.u0 <= last.u1 + 0.01) last.u1 = Math.max(last.u1, b.u1);
    else merged.push({ ...b });
  }

  const segs: Segment[] = [];
  let cur = sup.from;
  const pushSeg = (a: number, b: number) => {
    if (b - a >= 1.1) segs.push({ a, b, aSolid: probeSolid(ctx, sup, a, -1, stripV0, stripV1), bSolid: probeSolid(ctx, sup, b, 1, stripV0, stripV1) });
  };
  for (const m of merged) {
    pushSeg(cur, m.u0);
    cur = Math.max(cur, m.u1);
  }
  pushSeg(cur, sup.to);
  return segs;
}

/** Is there a wall / column / core just beyond this segment end?
    (grants the +30 cm width bonus of the house rules) */
function probeSolid(ctx: Ctx, sup: Support, u: number, side: 1 | -1, v0: number, v1: number): boolean {
  const spec = ctx.spec;
  const maxU = sup.axis === "h" ? spec.W : spec.H;
  if (u <= 0.02 && side === -1) return true;
  if (u >= maxU - 0.02 && side === 1) return true;
  // probe band = stall strip extended 0.6 m on the AISLE side only, so the
  // support's own backing wall never reads as a side obstacle
  const bandV0 = sup.dir === 1 ? v0 : v0 - 0.6;
  const bandV1 = sup.dir === 1 ? v1 + 0.6 : v1;
  const probe = uvRect(sup, side === 1 ? u : u - 0.35, side === 1 ? u + 0.35 : u, bandV0, bandV1);
  for (const r of ctx.hard) if (rectsOverlap(probe, r)) return true;
  return false;
}

/* ---------- stall construction ---------- */

function mkStall(
  ctx: Ctx,
  sup: Support,
  u: number,
  w: number,
  l: number,
  kind: "perp" | "para",
  tp: Stall["tp"]
): PlacedStall {
  let cx: number;
  let cy: number;
  let rot: number;
  if (kind === "perp") {
    const vC = sup.pos + (sup.dir * l) / 2;
    if (sup.axis === "h") {
      cx = u;
      cy = vC;
      rot = sup.dir === 1 ? 0 : 180; // nose into the wall
    } else {
      cx = vC;
      cy = u;
      rot = sup.dir === 1 ? 270 : 90;
    }
  } else {
    const vC = sup.pos + (sup.dir * w) / 2;
    if (sup.axis === "h") {
      cx = u;
      cy = vC;
      rot = 90; // car lies along the wall
    } else {
      cx = vC;
      cy = u;
      rot = 0;
    }
  }
  ctx.seq += 1;
  return {
    id: `g-${ctx.P.id}-${sup.name}-${ctx.seq}`,
    cx,
    cy,
    w,
    l,
    rot,
    tp,
    kind,
    flag: false,
    apts: [],
    supName: sup.name,
    u,
    apronDepth: 0,
    apron: { cx, cy, w: 0.1, l: 0.1, rot: 0 },
  };
}

/* ---------- fill one support with 90° stalls ---------- */

function fillPerp(ctx: Ctx, sup: Support, depth: number): void {
  const P = ctx.P;
  const segs = freeSegments(ctx, sup, depth, P.aisle, true);
  for (const seg of segs) {
    const L = seg.b - seg.a;
    const exL = seg.aSolid ? RULES.sideBonus : 0;
    const exR = seg.bSolid ? RULES.sideBonus : 0;
    const usable = L - exL - exR;
    if (usable < SMALL.w - 0.01) continue;

    const widths: Array<{ w: number; tp: Stall["tp"]; l: number }> = [];
    let n = Math.floor(usable / P.stdW);
    let rem = usable - n * P.stdW;
    let withSmall = false;
    if (P.compactFill && rem >= SMALL.w) {
      withSmall = true;
      rem -= SMALL.w;
    }
    const count = n + (withSmall ? 1 : 0);
    if (count === 0) {
      if (P.compactFill && usable >= SMALL.w) {
        widths.push({ w: usable >= SMALL.w + 0.3 ? SMALL.w + 0.3 : SMALL.w, tp: "small", l: SMALL.l });
      } else continue;
    } else {
      const bonus = Math.min(0.35, rem / count);
      for (let i = 0; i < n; i++) widths.push({ w: P.stdW + bonus, tp: P.tpMain, l: depth });
      if (withSmall) widths.push({ w: SMALL.w + bonus, tp: "small", l: Math.min(SMALL.l, depth) });
    }

    let cursor = seg.a;
    widths.forEach((spec2, i) => {
      const w = spec2.w + (i === 0 ? exL : 0) + (i === widths.length - 1 ? exR : 0);
      const st = mkStall(ctx, sup, cursor + w / 2, w, spec2.l, "perp", spec2.tp);
      cursor += w;
      // apron in front of the entry side
      let apron = entryApron(st, P.aisle);
      let ok = apronClear(ctx, apron);
      if (!ok && P.aisleFlag) {
        apron = entryApron(st, P.aisleFlag);
        if (apronClear(ctx, apron)) {
          ok = true;
          st.flag = true;
        }
      }
      if (!ok) return;
      // do not stand inside an earlier stall's manoeuvring apron
      for (const p of ctx.placed) if (obbOverlap(st, p.apron)) return;
      st.apronDepth = st.flag && P.aisleFlag ? P.aisleFlag : P.aisle;
      st.apron = apron;
      ctx.placed.push(st);
    });
  }
}

/* ---------- fill leftovers with parallel stalls ---------- */

function fillPara(ctx: Ctx, sup: Support): void {
  const P = ctx.P;
  // a parallel stall wedged into a pocket between 90° bays (N/S rows) is a
  // tight manoeuvre: only the max profile places it, and it gets flagged
  const pocketRow = sup.axis === "h";
  if (pocketRow && !P.aisleFlag) return;
  const segs = freeSegments(ctx, sup, PARA.w, 0.0, true);
  for (const seg of segs) {
    let cursor = seg.a;
    while (seg.b - cursor >= PARA_SMALL.l - 0.01) {
      const long = seg.b - cursor >= PARA.l;
      const len = long ? PARA.l : PARA_SMALL.l;
      const w = long ? PARA.w : PARA_SMALL.w;
      if (!long && !P.compactFill) break;
      const st = mkStall(ctx, sup, cursor + len / 2, w, len, "para", long ? "std" : "small");
      // lane on the inward side
      const aprons = sideAprons(st, P.aislePara);
      const inward = pickInward(sup, st, aprons);
      let ok = inward !== null && apronClear(ctx, inward);
      let flagOwners: PlacedStall[] = [];
      if (ok && inward) {
        // body may clip the outer edge of an earlier 90° apron the way the
        // surveyed plan does — but only shallowly, and both get flagged
        for (const p of ctx.placed) {
          const od = apronOverlapDepth(p.apron, st);
          if (od > 0.01) {
            if (P.aisleFlag && p.kind === "perp" && od <= PARA.w + 0.05) flagOwners.push(p);
            else {
              ok = false;
              break;
            }
          }
        }
      }
      if (ok && inward) {
        st.apron = inward;
        st.apronDepth = P.aislePara;
        if (pocketRow) st.flag = true;
        if (flagOwners.length) {
          st.flag = true;
          for (const p of flagOwners) p.flag = true;
        }
        ctx.placed.push(st);
        cursor += len;
      } else {
        cursor += 0.25;
      }
    }
  }
}

function pickInward(sup: Support, st: OBB, aprons: [OBB, OBB]): OBB | null {
  // inward = toward +dir normal of the support
  const want = sup.dir;
  for (const a of aprons) {
    const d = sup.axis === "h" ? a.cy - st.cy : a.cx - st.cx;
    if (Math.sign(d) === want) return a;
  }
  return null;
}

/* ---------- reachability from the exit opening ---------- */

function reachable(ctx: Ctx, stalls: PlacedStall[]): Set<string> {
  const { spec } = ctx;
  const nx = Math.max(2, Math.round(spec.W / REACH_CELL));
  const ny = Math.max(2, Math.round(spec.H / REACH_CELL));
  const obstacles: Rect[] = [...ctx.hard, ...stalls.map((s) => aabbOf(s))];
  const free = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const py = (j + 0.5) * REACH_CELL;
    for (let i = 0; i < nx; i++) {
      const px = (i + 0.5) * REACH_CELL;
      if (px < REACH_R || py < REACH_R || px > spec.W - REACH_R || py > spec.H - REACH_R) continue;
      let okc = true;
      for (const r of obstacles) {
        if (distToRect(px, py, r) < REACH_R) {
          okc = false;
          break;
        }
      }
      if (okc) free[j * nx + i] = 1;
    }
  }
  // BFS from the exit opening (inside the lane)
  const seen = new Uint8Array(nx * ny);
  const queue: number[] = [];
  const y0 = Math.max(0, Math.floor((ctx.spec.exitY0 + REACH_R) / REACH_CELL));
  const y1 = Math.min(ny - 1, Math.ceil((ctx.spec.exitY1 - REACH_R) / REACH_CELL));
  for (let j = y0; j <= y1; j++) {
    for (let i = Math.floor(REACH_R / REACH_CELL); i < Math.min(nx, Math.ceil(2.5 / REACH_CELL)); i++) {
      const idx = j * nx + i;
      if (free[idx] && !seen[idx]) {
        seen[idx] = 1;
        queue.push(idx);
      }
    }
  }
  while (queue.length) {
    const idx = queue.pop()!;
    const i = idx % nx;
    const j = (idx / nx) | 0;
    const nb = [idx - 1, idx + 1, idx - nx, idx + nx];
    const oks = [i > 0, i < nx - 1, j > 0, j < ny - 1];
    for (let k = 0; k < 4; k++) {
      if (!oks[k]) continue;
      const q = nb[k];
      if (free[q] && !seen[q]) {
        seen[q] = 1;
        queue.push(q);
      }
    }
  }
  const out = new Set<string>();
  for (const s of stalls) {
    const region = aabbOf(s.apron);
    let hit = false;
    const i0 = Math.max(0, Math.floor(region.x / REACH_CELL));
    const i1 = Math.min(nx - 1, Math.ceil((region.x + region.w) / REACH_CELL));
    const j0 = Math.max(0, Math.floor(region.y / REACH_CELL));
    const j1 = Math.min(ny - 1, Math.ceil((region.y + region.h) / REACH_CELL));
    for (let j = j0; j <= j1 && !hit; j++) {
      for (let i = i0; i <= i1; i++) {
        if (seen[j * nx + i]) {
          hit = true;
          break;
        }
      }
    }
    if (hit) out.add(s.id);
  }
  return out;
}

/* ---------- accessible stall (PMR) ---------- */

function convertPmr(ctx: Ctx, structure: StructItem[]): boolean {
  const door = structure.find((s) => s.type === "door");
  const core = structure.find((s) => s.type === "core");
  const ref = door
    ? { x: door.x + door.w / 2, y: door.y + door.h / 2 }
    : core
      ? { x: core.x + core.w / 2, y: core.y + core.h / 2 }
      : { x: 0.5, y: (ctx.spec.exitY0 + ctx.spec.exitY1) / 2 };
  const perps = ctx.placed
    .filter((s) => s.kind === "perp" && !s.flag)
    .sort((a, b) => Math.hypot(a.cx - ref.x, a.cy - ref.y) - Math.hypot(b.cx - ref.x, b.cy - ref.y));
  for (const s of perps) {
    const mate = perps.find(
      (o) =>
        o !== s &&
        o.supName === s.supName &&
        Math.abs(Math.abs(o.u - s.u) - (o.w + s.w) / 2) < 0.08
    );
    if (!mate) continue;
    const u0 = Math.min(s.u - s.w / 2, mate.u - mate.w / 2);
    const u1 = Math.max(s.u + s.w / 2, mate.u + mate.w / 2);
    const sup: Support = {
      name: s.supName,
      axis: s.rot % 180 === 0 ? "h" : "v",
      pos:
        s.rot % 180 === 0
          ? s.cy + (s.rot === 0 ? -s.l / 2 : s.l / 2)
          : s.cx + (s.rot === 270 ? -s.l / 2 : s.l / 2),
      from: u0,
      to: u1,
      dir: s.rot === 0 || s.rot === 270 ? 1 : -1,
    };
    const pmr = mkStall(ctx, sup, (u0 + u1) / 2, 3.5, Math.max(5.0, Math.min(s.l, 5.5)), "perp", "pmr");
    pmr.apron = entryApron(pmr, ctx.P.aisle);
    pmr.apronDepth = ctx.P.aisle;
    ctx.placed = ctx.placed.filter((p) => p !== s && p !== mate);
    ctx.placed.push(pmr);
    return true;
  }
  return false;
}

/* ---------- circulation arrows ---------- */

function buildFlow(ctx: Ctx, structure: StructItem[]): FlowArrow[] {
  const { spec } = ctx;
  const arrows: FlowArrow[] = [];
  const cor = ctx.corridor;
  if (cor) {
    const cx = cor.x + cor.w / 2;
    const yTop = Math.max(0.8, spec.laneH - 1.1);
    const yBot = Math.min(spec.H - 1, spec.laneH + 1.8);
    arrows.push({ x1: cx - 0.8, y1: yTop, x2: cx - 0.8, y2: yBot });
    arrows.push({ x1: cx + 0.8, y1: yBot, x2: cx + 0.8, y2: yTop });
  }
  const cores = structure.filter((s) => s.type === "core" || (s.type === "wall" && s.h > 1));
  if (cores.length) {
    const left = Math.min(...cores.map((c) => c.x));
    const right = Math.max(...cores.map((c) => c.x + c.w));
    const top = Math.min(...cores.map((c) => c.y));
    const bottom = Math.max(...cores.map((c) => c.y + c.h));
    const wFront = Math.max(
      0.4,
      ...ctx.placed.filter((s) => s.supName === "W").map((s) => aabbOf(s).x + aabbOf(s).w)
    );
    const eFront = Math.min(
      spec.W - 0.4,
      ...ctx.placed.filter((s) => s.supName === "E").map((s) => aabbOf(s).x)
    );
    const sHeads = Math.min(
      spec.H - 0.5,
      ...ctx.placed.filter((s) => s.supName === "S").map((s) => aabbOf(s).y)
    );
    const wx = (wFront + left) / 2;
    const ex = (right + eFront) / 2;
    const sy = (bottom + sHeads) / 2;
    const ty = Math.max(spec.laneH + 1.2, (spec.laneH + top) / 2);
    if (left - wFront > 2.2 && bottom < sHeads) {
      arrows.push({ x1: wx, y1: Math.min(top + 1.2, sy - 2), x2: wx, y2: sy - 1.2, oneWayLabel: true });
      arrows.push({ x1: Math.max(wx - 0.6, 1), y1: sy, x2: Math.min(ex + 0.4, spec.W - 2.2), y2: sy });
      const upEnd = ctx.topRoad ? ctx.lane.h + 0.9 : Math.min(top + 1.4, sy - 2);
      arrows.push({ x1: ex, y1: sy - 1.2, x2: ex, y2: upEnd });
      if (ctx.topRoad) {
        // straight run along the through-road back to the exit
        arrows.push({
          x1: Math.min(spec.W - 1.4, ex + 0.6),
          y1: ctx.lane.h * 0.55,
          x2: (cor ? cor.x + cor.w : 2.2) + 0.4,
          y2: ctx.lane.h * 0.55,
        });
      } else {
        arrows.push({ x1: ex - 0.8, y1: ty, x2: (cor ? cor.x + cor.w : ex - 3) + 0.4, y2: ty });
      }
    }
  } else {
    const cx = spec.W / 2;
    arrows.push({ x1: cx - 0.8, y1: spec.laneH + 1.5, x2: cx - 0.8, y2: Math.max(spec.laneH + 3, spec.H - 6.8), oneWayLabel: true });
    arrows.push({ x1: cx + 0.8, y1: Math.max(spec.laneH + 3, spec.H - 6.8), x2: cx + 0.8, y2: spec.laneH + 1.5 });
    if (ctx.topRoad) {
      arrows.push({ x1: spec.W - 1.4, y1: ctx.lane.h * 0.55, x2: cx + 1.6, y2: ctx.lane.h * 0.55 });
    }
  }
  return arrows;
}

/* ---------- main entry ---------- */

export interface GenOpts {
  /** keep the whole top strip (lane depth × full width) as a through-road */
  topRoad?: boolean;
}

export function generateScenario(
  spec: GarageSpec,
  structure: StructItem[],
  profileId: ProfileId,
  genOpts: GenOpts = {}
): GenResult {
  const P = PROFILES[profileId];
  const topRoad = !!genOpts.topRoad;
  const hard = structure
    .filter((s) => s.type === "core" || s.type === "wall" || s.type === "col" || s.type === "nozone")
    .map(structRect);
  const doors = structure.filter((s) => s.type === "door").map((s) => {
    const r = structRect(s);
    return { x: r.x - RULES.doorClear, y: r.y - RULES.doorClear, w: r.w + 2 * RULES.doorClear, h: r.h + 2 * RULES.doorClear };
  });
  const laneWBase = Math.min(spec.laneW, spec.W);
  const lane: Rect = { x: 0, y: 0, w: topRoad ? spec.W : laneWBase, h: Math.min(spec.laneH, spec.H) };

  // entry corridor: widest gap under the ORIGINAL lane's south edge (the
  // column-gap descent stays the main way down even with a through-road)
  let corridor: Rect | null = null;
  if (laneWBase > 0.5 && lane.h > 0.5 && lane.h < spec.H - 2) {
    const edge = { v0: lane.h - 0.15, v1: lane.h + 0.7 };
    const blocks: Array<[number, number]> = [];
    for (const r of hard) {
      if (r.y < edge.v1 && r.y + r.h > edge.v0) blocks.push([Math.max(0, r.x), Math.min(laneWBase, r.x + r.w)]);
    }
    blocks.sort((a, b) => a[0] - b[0]);
    let best: [number, number] = [0, 0];
    let cur = 0;
    for (const [a, b] of blocks) {
      if (a - cur > best[1] - best[0]) best = [cur, a];
      cur = Math.max(cur, b);
    }
    if (laneWBase - cur > best[1] - best[0]) best = [cur, laneWBase];
    if (best[1] - best[0] >= 2.6) {
      corridor = { x: best[0], y: lane.h, w: best[1] - best[0], h: Math.min(P.aisle + 1.0, spec.H - lane.h - 0.5) };
    }
  }

  // with a through-road the loop needs a descent at its east end too:
  // road → down the east side → around → straight run back out
  let eastDescent: Rect | null = null;
  if (topRoad && spec.W >= 7 && lane.h > 0.5 && lane.h < spec.H - 2) {
    eastDescent = {
      x: spec.W - 3.4,
      y: lane.h,
      w: 3.4,
      h: Math.min(P.aisle + 1.2, spec.H - lane.h - 0.5),
    };
  }

  const ctx: Ctx = {
    spec,
    P,
    hard,
    bodyReserved: [
      ...hard,
      ...doors,
      lane,
      ...(corridor ? [corridor] : []),
      ...(eastDescent ? [eastDescent] : []),
    ],
    lane,
    corridor,
    topRoad,
    placed: [],
    seq: 0,
  };

  const sups = supportsOf(spec, structure);
  for (const sup of sups) {
    const depth = snapDepthToColumns(sup, P.depth, structure);
    fillPerp(ctx, sup, depth);
  }
  for (const sup of sups) fillPara(ctx, sup);

  // drop anything a car cannot actually reach from the exit
  let dropped = 0;
  for (let iter = 0; iter < 4; iter++) {
    const ok = reachable(ctx, ctx.placed);
    const before = ctx.placed.length;
    ctx.placed = ctx.placed.filter((s) => ok.has(s.id));
    dropped += before - ctx.placed.length;
    if (ctx.placed.length === before) break;
  }

  let pmr = false;
  if (P.pmr) pmr = convertPmr(ctx, structure);

  const flow = buildFlow(ctx, structure);

  const stalls: Stall[] = ctx.placed.map((p) => ({
    id: p.id,
    cx: round2(p.cx),
    cy: round2(p.cy),
    w: round2(p.w),
    l: round2(p.l),
    rot: p.rot,
    tp: p.tp,
    kind: p.kind,
    flag: p.flag,
    apts: [],
  }));

  return {
    stalls,
    flow,
    stats: {
      cars: stalls.filter((s) => s.tp !== "moto").length,
      flagged: stalls.filter((s) => s.flag).length,
      pmr,
      dropped,
    },
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
