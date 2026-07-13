/* =====================================================================
   GARAGE PLANNER v3 — data model
   Default geometry: surveyed garage 17.60 × 29.75 m, exit through the
   WEST wall (4.47 m opening), 16 apartments.
   Origin = interior top-left corner; x → east, y → south. Meters.
   ===================================================================== */

export type Lang = "fr" | "en";
export type StallTypeKey = "small" | "std" | "suv" | "xl" | "pmr" | "moto";
export type ObstacleTypeKey = "col" | "wallb" | "noz";
export type StructType = "wall" | "core" | "col" | "door" | "nozone";
export type StallKind = "perp" | "para";

export interface Stall {
  id: string;
  cx: number;
  cy: number;
  w: number; // width (across the car)
  l: number; // length (along the car)
  rot: number; // deg, 0 = nose north, 90 = nose east, 180 = nose south
  tp: StallTypeKey;
  kind: StallKind;
  flag: boolean; // "tight manoeuvre"
  apts: number[];
}

export interface StructItem {
  id: string;
  type: StructType;
  x: number;
  y: number;
  w: number;
  h: number;
  lab?: string;
}

/** Garage envelope. Exit is an opening in the WEST wall spanning [exitY0, exitY1].
    The exit lane (keep clear) is the rect (0, 0, laneW, laneH). */
export interface GarageSpec {
  W: number;
  H: number;
  exitY0: number;
  exitY1: number;
  laneW: number;
  laneH: number;
}

export interface FlowArrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  oneWayLabel?: boolean;
}

export interface Doc {
  garage: GarageSpec;
  stalls: Stall[];
  structure: StructItem[];
  napt: number;
  flow: FlowArrow[];
  /** id of the scenario the current stalls came from, until manually edited */
  scenarioId: string | null;
  dirty: boolean;
  /** the whole top strip (lane depth × full width) is a through-road kept
      clear of stalls, for easy entry / exit and turning */
  topRoad: boolean;
}

export const STALL_TYPES: Record<StallTypeKey, { w: number; l: number }> = {
  small: { w: 2.2, l: 4.3 },
  std: { w: 2.5, l: 5.0 },
  suv: { w: 2.8, l: 5.4 },
  xl: { w: 3.15, l: 5.95 },
  pmr: { w: 3.5, l: 5.0 },
  moto: { w: 1.2, l: 2.5 },
};

export const OBSTACLE_TYPES: Record<ObstacleTypeKey, { w: number; l: number; type: StructType }> = {
  col: { w: 0.51, l: 0.51, type: "col" },
  wallb: { w: 2.0, l: 1.0, type: "wall" },
  noz: { w: 3.0, l: 3.0, type: "nozone" },
};

/* Aisle rules (m). One-way ≥ 3.00, two-way ≥ 5.00, in front of 90° stalls
   5.00–5.50; a stall against a wall/column gets +0.30 m width. */
export const RULES = {
  aislePerp: 5.0, // comfortable manoeuvring in front of 90° stalls
  aislePerpTight: 4.6, // still workable but flagged "tight manoeuvre"
  aislePara: 3.0, // one-way lane beside parallel stalls
  sideBonus: 0.3, // extra width against wall / column
  doorClear: 0.3, // keep-clear inflation around doors
  clearanceView: 0.25, // ±25 cm visual clearance layer
};

let uidCounter = 0;
export function uid(): string {
  uidCounter += 1;
  return "o" + uidCounter.toString(36) + Math.random().toString(36).slice(2, 7);
}

export function defaultGarage(): GarageSpec {
  return { W: 17.6, H: 29.75, exitY0: 0, exitY1: 4.47, laneW: 12.03, laneH: 4.47 };
}

export function defaultStructure(): StructItem[] {
  return [
    { id: "tw", type: "wall", x: 0, y: 4.47, w: 6.68, h: 0.28 },
    { id: "coreA", type: "core", x: 7.6, y: 9.12, w: 3.43, h: 7.75 },
    { id: "coreB", type: "core", x: 7.6, y: 16.87, w: 1.83, h: 1.68 },
    { id: "wing", type: "wall", x: 6.08, y: 15.4, w: 1.52, h: 3.15, lab: "wingL" },
    { id: "cT1", type: "col", x: 6.68, y: 4.47, w: 0.51, h: 0.51 },
    { id: "cT2", type: "col", x: 11.52, y: 4.47, w: 0.51, h: 0.51 },
    { id: "c1", type: "col", x: 6.3, y: 23.19, w: 0.51, h: 0.51 },
    { id: "c2", type: "col", x: 9.61, y: 23.19, w: 0.51, h: 0.51 },
    { id: "c3", type: "col", x: 13.69, y: 23.19, w: 0.51, h: 0.51 },
    { id: "d1", type: "door", x: 6.4, y: 10.55, w: 1.2, h: 1.1 },
    { id: "d2", type: "door", x: 6.52, y: 14.25, w: 0.95, h: 1.1 },
  ];
}

function s(
  id: string,
  cx: number,
  cy: number,
  w: number,
  l: number,
  rot: number,
  tp: StallTypeKey,
  kind: StallKind,
  flag = false
): Stall {
  return { id, cx, cy, w, l, rot, tp, kind, flag, apts: [] };
}

/** Hand-tuned surveyed layout — 13 cars (2 flagged as tight manoeuvres). */
export function presetSurveyOptimal(): Stall[] {
  return [
    s("p1", 1.65, 7.15, 2.5, 4.8, 0, "std", "perp"), // N-W pair (reverse-in)
    s("p2", 4.35, 7.15, 2.5, 4.8, 0, "std", "perp"),
    s("p3", 13.8, 2.7, 2.5, 4.8, 0, "std", "perp"), // N-E pair on north wall
    s("p4", 16.4, 2.7, 2.3, 4.8, 0, "std", "perp"),
    s("p5", 16.45, 8.8, 2.2, 5.6, 0, "std", "para"), // east wall parallel
    s("p6", 16.45, 14.8, 2.2, 5.6, 0, "std", "para"),
    s("p7", 1.15, 12.65, 2.2, 5.5, 0, "std", "para"), // west wall parallel
    s("p8", 1.12, 18.15, 2.15, 4.5, 0, "small", "para", true), // compact — flagged
    s("p9", 1.675, 26.675, 2.95, 5.95, 180, "xl", "perp"), // south row
    s("p10", 4.725, 26.675, 2.75, 5.95, 180, "suv", "perp"),
    s("p11", 8.21, 26.675, 2.6, 5.95, 180, "std", "perp", true), // between columns — flagged
    s("p12", 11.905, 26.675, 3.15, 5.95, 180, "xl", "perp"),
    s("p13", 15.9, 26.675, 3.0, 5.95, 180, "suv", "perp"),
  ];
}

/** Surveyed comfort layout — the optimal one minus flagged stalls. */
export function presetSurveyComfort(): Stall[] {
  return presetSurveyOptimal().filter((st) => !st.flag);
}

/** Surveyed easy-access layout — the optimal one WITHOUT the two stalls on
    the north wall (displayed as 1 & 2): their strip stays a through-road,
    so entering, exiting and turning are straightforward. */
export function presetSurveyEasy(): Stall[] {
  return presetSurveyOptimal().filter((st) => st.id !== "p3" && st.id !== "p4");
}

/** Counter-clockwise circulation loop of the surveyed garage. */
export function surveyFlow(): FlowArrow[] {
  return [
    { x1: 8.7, y1: 3.4, x2: 8.7, y2: 6.2 }, // in through the column gap
    { x1: 10.3, y1: 6.2, x2: 10.3, y2: 3.4 }, // out through the gap
    { x1: 4.0, y1: 10.4, x2: 4.0, y2: 17.4, oneWayLabel: true }, // west aisle ↓
    { x1: 3.4, y1: 21.0, x2: 12.6, y2: 21.0 }, // south aisle →
    { x1: 13.4, y1: 19.2, x2: 13.4, y2: 7.6 }, // east aisle ↑
    { x1: 12.6, y1: 6.9, x2: 11.0, y2: 6.9 }, // top corridor ←
  ];
}

/** Circulation of the easy-access variant: the loop continues up the east
    aisle onto the through-road and runs straight out to the exit. */
export function surveyEasyFlow(): FlowArrow[] {
  return [
    ...surveyFlow(),
    { x1: 13.4, y1: 7.0, x2: 13.4, y2: 2.9 }, // east aisle continues into the road
    { x1: 12.7, y1: 2.3, x2: 6.9, y2: 2.3 }, // straight run-out to the exit
  ];
}

export function newDoc(): Doc {
  return {
    garage: defaultGarage(),
    stalls: presetSurveyOptimal(),
    structure: defaultStructure(),
    napt: 16,
    flow: surveyFlow(),
    scenarioId: "survey-opt",
    dirty: false,
    topRoad: false,
  };
}

/** Deep-clone a doc (plain JSON data). */
export function cloneDoc(d: Doc): Doc {
  return JSON.parse(JSON.stringify(d)) as Doc;
}

export const STORAGE_KEY = "garage-planner-v3";
