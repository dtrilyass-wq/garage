import type { Doc, Stall } from "./model";
import { RULES } from "./model";
import { cornersOf, entryApron, obbOverlap, sideAprons, toOBB, type OBB, type Rect } from "./geom";

export type HardWarning = "wWall" | "wOver" | "wLane" | "wDoor";
export type SoftWarning = "wAisle";

export interface StallWarnings {
  hard: HardWarning[];
  soft: SoftWarning[];
}

export type WarningMap = Record<string, StallWarnings>;

function laneRect(doc: Doc): Rect {
  // with the through-road option the keep-clear strip spans the full width
  const w = doc.topRoad ? doc.garage.W : doc.garage.laneW;
  return { x: 0, y: 0, w, h: doc.garage.laneH };
}

/** Blocking obstacles for manoeuvring: structure + garage walls (as outside). */
function hardObstacles(doc: Doc): OBB[] {
  return doc.structure
    .filter((s) => s.type === "core" || s.type === "wall" || s.type === "col" || s.type === "nozone")
    .map((s) => toOBB({ x: s.x, y: s.y, w: s.w, h: s.h }));
}

function apronBlocked(apron: OBB, doc: Doc, self: Stall, obstacles: OBB[]): boolean {
  const { W, H } = doc.garage;
  // Apron sticking out of the garage envelope counts as blocked.
  for (const c of cornersOf(apron)) {
    if (c.x < -0.02 || c.y < -0.02 || c.x > W + 0.02 || c.y > H + 0.02) return true;
  }
  for (const o of obstacles) if (obbOverlap(apron, o)) return true;
  for (const other of doc.stalls) {
    if (other.id === self.id) continue;
    if (obbOverlap(apron, other)) return true;
  }
  return false;
}

/** Compute hard errors (red) and soft manoeuvring warnings (orange) per stall. */
export function computeWarnings(doc: Doc): WarningMap {
  const { W, H } = doc.garage;
  const obstacles = hardObstacles(doc);
  const doors = doc.structure
    .filter((s) => s.type === "door")
    .map((s) => toOBB({ x: s.x, y: s.y, w: s.w, h: s.h }));
  const lane = toOBB(laneRect(doc));

  const out: WarningMap = {};
  for (const s of doc.stalls) {
    const hard: HardWarning[] = [];
    const soft: SoftWarning[] = [];

    for (const c of cornersOf(s)) {
      if (c.x < -0.02 || c.y < -0.02 || c.x > W + 0.02 || c.y > H + 0.02) {
        hard.push("wWall");
        break;
      }
    }
    for (const o of obstacles) {
      if (obbOverlap(s, o)) {
        hard.push("wOver");
        break;
      }
    }
    for (const other of doc.stalls) {
      if (other !== s && obbOverlap(s, other)) {
        hard.push("wOver");
        break;
      }
    }
    if (obbOverlap(s, lane)) hard.push("wLane");
    for (const d of doors) {
      if (obbOverlap(s, d)) {
        hard.push("wDoor");
        break;
      }
    }

    // Soft: manoeuvring space. Perp stalls need a clear apron behind the
    // entry side; parallel stalls need a lane on at least one long side.
    if (hard.length === 0) {
      if (s.kind === "perp" && s.tp !== "moto") {
        const apron = entryApron(s, RULES.aislePerp);
        if (apronBlocked(apron, doc, s, obstacles)) soft.push("wAisle");
      } else if (s.kind === "para") {
        const [a, b] = sideAprons(s, RULES.aislePara);
        if (apronBlocked(a, doc, s, obstacles) && apronBlocked(b, doc, s, obstacles)) soft.push("wAisle");
      }
    }

    out[s.id] = { hard: [...new Set(hard)], soft };
  }
  return out;
}

export function countHard(map: WarningMap): number {
  return Object.values(map).reduce((a, w) => a + (w.hard.length ? 1 : 0), 0);
}
