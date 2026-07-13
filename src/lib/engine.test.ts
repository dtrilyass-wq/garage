import { describe, expect, it } from "vitest";
import {
  defaultGarage,
  defaultStructure,
  presetSurveyComfort,
  presetSurveyEasy,
  presetSurveyOptimal,
  surveyFlow,
  type Doc,
  type GarageSpec,
  type Stall,
  type StructItem,
} from "./model";
import { cornersOf, entryApron, obbOverlap } from "./geom";
import { computeWarnings } from "./warnings";
import { generateScenario, type ProfileId } from "./generate";

function mkDoc(garage: GarageSpec, structure: StructItem[], stalls: Stall[], topRoad = false): Doc {
  return { garage, structure, stalls, napt: 16, flow: surveyFlow(), scenarioId: null, dirty: false, topRoad };
}

function hardWarningCount(
  garage: GarageSpec,
  structure: StructItem[],
  stalls: Stall[],
  topRoad = false
): number {
  const warn = computeWarnings(mkDoc(garage, structure, stalls, topRoad));
  return Object.values(warn).reduce((a, w) => a + w.hard.length, 0);
}

describe("geometry", () => {
  it("detects OBB overlap and separation", () => {
    const a = { cx: 0, cy: 0, w: 2, l: 4, rot: 0 };
    expect(obbOverlap(a, { cx: 1, cy: 1, w: 2, l: 4, rot: 0 })).toBe(true);
    expect(obbOverlap(a, { cx: 3, cy: 0, w: 2, l: 4, rot: 0 })).toBe(false);
    expect(obbOverlap(a, { cx: 2.4, cy: 0, w: 2, l: 4, rot: 45 })).toBe(true);
  });

  it("puts the entry apron behind the tail (rot 0 = nose north)", () => {
    const apron = entryApron({ cx: 5, cy: 10, w: 2.5, l: 5, rot: 0 }, 5);
    expect(apron.cy).toBeCloseTo(15);
    const apron180 = entryApron({ cx: 5, cy: 10, w: 2.5, l: 5, rot: 180 }, 5);
    expect(apron180.cy).toBeCloseTo(5);
  });

  it("keeps rotated corners consistent", () => {
    const cs = cornersOf({ cx: 0, cy: 0, w: 2, l: 4, rot: 90 });
    const xs = cs.map((p) => p.x);
    const ys = cs.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2);
  });
});

describe("surveyed presets", () => {
  it("keeps the surveyed 13-car layout intact and hard-warning-free", () => {
    const stalls = presetSurveyOptimal();
    expect(stalls).toHaveLength(13);
    expect(stalls.filter((s) => s.flag)).toHaveLength(2);
    expect(hardWarningCount(defaultGarage(), defaultStructure(), stalls)).toBe(0);
  });

  it("comfort preset removes exactly the flagged stalls", () => {
    expect(presetSurveyComfort()).toHaveLength(11);
  });
});

describe("generator on the surveyed garage", () => {
  const garage = defaultGarage();
  const structure = defaultStructure();

  for (const id of ["max", "comfort", "suv"] as ProfileId[]) {
    it(`profile "${id}" produces a hard-warning-free layout`, () => {
      const r = generateScenario(garage, structure, id);
      expect(r.stats.cars).toBeGreaterThan(0);
      expect(hardWarningCount(garage, structure, r.stalls)).toBe(0);
    });
  }

  it("max profile reaches a realistic capacity (≥ 10 cars)", () => {
    const r = generateScenario(garage, structure, "max");
    expect(r.stats.cars).toBeGreaterThanOrEqual(10);
  });

  it("comfort profile has no flagged stalls and includes an accessible stall", () => {
    const r = generateScenario(garage, structure, "comfort");
    expect(r.stats.flagged).toBe(0);
    expect(r.stalls.some((s) => s.tp === "pmr")).toBe(true);
  });

  it("suv profile uses wide stalls", () => {
    const r = generateScenario(garage, structure, "suv");
    const mains = r.stalls.filter((s) => s.kind === "perp" && s.tp === "suv");
    expect(mains.length).toBeGreaterThan(0);
    for (const s of mains) expect(s.w).toBeGreaterThanOrEqual(2.8);
  });

  it("south row aligns between the bottom columns", () => {
    const r = generateScenario(garage, structure, "max");
    const south = r.stalls.filter((s) => s.rot === 180);
    expect(south.length).toBeGreaterThanOrEqual(4);
    // no south stall body may overlap a bottom column
    for (const s of south) {
      for (const colId of ["c1", "c2", "c3"]) {
        const col = structure.find((c) => c.id === colId)!;
        expect(
          obbOverlap(s, { cx: col.x + col.w / 2, cy: col.y + col.h / 2, w: col.w, l: col.h, rot: 0 })
        ).toBe(false);
      }
    }
  });

  it("keeps the exit lane and stair core clear", () => {
    for (const id of ["max", "comfort", "suv"] as ProfileId[]) {
      const r = generateScenario(garage, structure, id);
      const lane = { cx: garage.laneW / 2, cy: garage.laneH / 2, w: garage.laneW, l: garage.laneH, rot: 0 };
      for (const s of r.stalls) expect(obbOverlap(s, lane)).toBe(false);
    }
  });
});

describe("through-road (easy in/out) scenarios", () => {
  const garage = defaultGarage();
  const structure = defaultStructure();
  const road = { cx: garage.W / 2, cy: garage.laneH / 2, w: garage.W, l: garage.laneH, rot: 0 };

  it("surveyed easy-access drops the two north stalls and keeps the strip clear", () => {
    const stalls = presetSurveyEasy();
    expect(stalls).toHaveLength(11);
    expect(stalls.find((s) => s.id === "p3")).toBeUndefined();
    expect(stalls.find((s) => s.id === "p4")).toBeUndefined();
    for (const s of stalls) expect(obbOverlap(s, road)).toBe(false);
    expect(hardWarningCount(garage, structure, stalls, true)).toBe(0);
  });

  for (const id of ["max", "comfort", "suv"] as ProfileId[]) {
    it(`profile "${id}" with the through-road keeps the full top strip clear`, () => {
      const r = generateScenario(garage, structure, id, { topRoad: true });
      for (const s of r.stalls) expect(obbOverlap(s, road)).toBe(false);
      expect(hardWarningCount(garage, structure, r.stalls, true)).toBe(0);
    });
  }

  it("the through-road trades a couple of stalls for circulation, never more", () => {
    const base = generateScenario(garage, structure, "max");
    const open = generateScenario(garage, structure, "max", { topRoad: true });
    expect(open.stats.cars).toBeGreaterThanOrEqual(base.stats.cars - 3);
    expect(open.stats.cars).toBeLessThanOrEqual(base.stats.cars);
    expect(open.stats.cars).toBeGreaterThanOrEqual(9);
  });
});

describe("generator with a resizable garage", () => {
  it("a wider garage fits at least as many cars", () => {
    const structure = defaultStructure();
    const base = generateScenario(defaultGarage(), structure, "max");
    const wide = generateScenario({ ...defaultGarage(), W: 24 }, structure, "max");
    expect(wide.stats.cars).toBeGreaterThanOrEqual(base.stats.cars);
    expect(hardWarningCount({ ...defaultGarage(), W: 24 }, structure, wide.stalls)).toBe(0);
  });

  it("survives a tiny garage without crashing or cheating", () => {
    const spec: GarageSpec = { W: 8, H: 10, exitY0: 0, exitY1: 3, laneW: 6, laneH: 3 };
    const r = generateScenario(spec, [], "max");
    expect(hardWarningCount(spec, [], r.stalls)).toBe(0);
    for (const s of r.stalls) {
      for (const c of cornersOf(s)) {
        expect(c.x).toBeGreaterThanOrEqual(-0.02);
        expect(c.y).toBeGreaterThanOrEqual(-0.02);
        expect(c.x).toBeLessThanOrEqual(spec.W + 0.02);
        expect(c.y).toBeLessThanOrEqual(spec.H + 0.02);
      }
    }
  });

  it("an empty rectangular hall gets a dense, valid layout", () => {
    const spec: GarageSpec = { W: 20, H: 30, exitY0: 0, exitY1: 4, laneW: 10, laneH: 4 };
    const r = generateScenario(spec, [], "max");
    expect(r.stats.cars).toBeGreaterThanOrEqual(12);
    expect(hardWarningCount(spec, [], r.stalls)).toBe(0);
  });
});
