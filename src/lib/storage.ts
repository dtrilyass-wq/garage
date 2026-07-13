/* localStorage persistence + JSON import (accepts v2 and v3 files). */

import {
  STORAGE_KEY,
  defaultGarage,
  defaultStructure,
  newDoc,
  surveyFlow,
  type Doc,
  type Stall,
  type StructItem,
} from "./model";

interface V2File {
  stalls?: Stall[];
  structure?: StructItem[];
  napt?: number;
}

interface V3File extends V2File {
  v?: number;
  garage?: Doc["garage"];
  flow?: Doc["flow"];
  topRoad?: boolean;
  scenarioId?: string | null;
  dirty?: boolean;
}

export function docFromJson(raw: string): Doc {
  const o = JSON.parse(raw) as V3File;
  if (!o || typeof o !== "object" || !Array.isArray(o.stalls)) throw new Error("bad file");
  const base = newDoc();
  return {
    garage: o.garage && typeof o.garage.W === "number" ? o.garage : defaultGarage(),
    stalls: (o.stalls || []).map((s) => ({ ...s, apts: s.apts || [], flag: !!s.flag })),
    structure: Array.isArray(o.structure) && o.structure.length ? o.structure : defaultStructure(),
    napt: typeof o.napt === "number" ? Math.max(1, Math.min(60, o.napt)) : base.napt,
    flow: Array.isArray(o.flow) ? o.flow : surveyFlow(),
    scenarioId: typeof o.scenarioId === "string" ? o.scenarioId : null,
    dirty: typeof o.dirty === "boolean" ? o.dirty : true,
    topRoad: !!o.topRoad,
  };
}

export function docToJson(doc: Doc): string {
  return JSON.stringify({
    v: 3,
    garage: doc.garage,
    stalls: doc.stalls,
    structure: doc.structure,
    napt: doc.napt,
    flow: doc.flow,
    topRoad: doc.topRoad,
    scenarioId: doc.scenarioId,
    dirty: doc.dirty,
  });
}

export function loadSaved(): Doc | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return docFromJson(raw);
  } catch {
    return null;
  }
}

export function persist(doc: Doc): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, docToJson(doc));
  } catch {
    /* storage full or unavailable — ignore */
  }
}
