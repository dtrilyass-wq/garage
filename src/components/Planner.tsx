"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  OBSTACLE_TYPES,
  STALL_TYPES,
  newDoc,
  presetSurveyComfort,
  presetSurveyEasy,
  presetSurveyOptimal,
  surveyEasyFlow,
  surveyFlow,
  uid,
  type Doc,
  type Lang,
  type ObstacleTypeKey,
  type Stall,
  type StallTypeKey,
} from "@/lib/model";
import { fmtM, tr } from "@/lib/i18n";
import { computeWarnings, countHard } from "@/lib/warnings";
import { generateScenario, type ProfileId } from "@/lib/generate";
import { docFromJson, docToJson, loadSaved, persist } from "@/lib/storage";
import { exportPNG } from "@/lib/exportPng";
import { CanvasStage, type StageHandle } from "./CanvasStage";
import { Panel, type PanelApi, type ScenarioCard } from "./Panel";
import type { LayerOpts, Selection } from "@/lib/render";

const AUTO_IDS: Record<string, ProfileId> = {
  "auto-max": "max",
  "auto-comfort": "comfort",
  "auto-suv": "suv",
};

export default function Planner() {
  const [lang, setLang] = useState<Lang>("en");
  const [doc, setDoc] = useState<Doc>(() => newDoc());
  const [undoStack, setUndoStack] = useState<Doc[]>([]);
  const [redoStack, setRedoStack] = useState<Doc[]>([]);
  const [booted, setBooted] = useState(false);
  const [tool, setTool] = useState<"sel" | "measure">("sel");
  const [sel, setSel] = useState<Selection | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [opts, setOpts] = useState<LayerOpts>({
    grid: true,
    dims: true,
    sdims: true,
    flow: true,
    safe: true,
    clear: false,
    snap: true,
    struct: false,
  });
  const stageRef = useRef<StageHandle>(null);
  const docRef = useRef(doc);
  docRef.current = doc;
  const t = tr(lang);

  /* ---------- boot & persistence ---------- */
  useEffect(() => {
    const saved = loadSaved();
    const d = saved ?? newDoc();
    setDoc(d);
    setUndoStack([d]);
    setRedoStack([]);
    try {
      const l = window.localStorage.getItem("gp-lang");
      if (l === "fr" || l === "en") setLang(l);
    } catch {}
    setBooted(true);
  }, []);

  useEffect(() => {
    if (!booted) return;
    const h = window.setTimeout(() => persist(doc), 700);
    return () => window.clearTimeout(h);
  }, [doc, booted]);

  useEffect(() => {
    try {
      window.localStorage.setItem("gp-lang", lang);
    } catch {}
  }, [lang]);

  /* ---------- history ---------- */
  const commit = useCallback((next: Doc) => {
    docRef.current = next;
    setDoc(next);
    setUndoStack((s) => [...s.slice(-59), next]);
    setRedoStack([]);
  }, []);

  const liveEdit = useCallback((fn: (d: Doc) => Doc) => {
    setDoc((d) => {
      const n = fn(d);
      docRef.current = n; // keep the ref fresh even before React re-renders
      return n;
    });
  }, []);

  const commitLive = useCallback(
    (isStruct: boolean) => {
      let next = docRef.current;
      if (isStruct) {
        if (!next.dirty && next.scenarioId && AUTO_IDS[next.scenarioId]) {
          const g = generateScenario(next.garage, next.structure, AUTO_IDS[next.scenarioId], {
            topRoad: next.topRoad,
          });
          next = { ...next, stalls: g.stalls, flow: g.flow };
        }
      } else {
        next = { ...next, dirty: true };
      }
      commit(next);
    },
    [commit]
  );

  const undo = useCallback(() => {
    setUndoStack((s) => {
      if (s.length < 2) return s;
      const copy = s.slice();
      const cur = copy.pop()!;
      setRedoStack((r) => [...r, cur]);
      setDoc(copy[copy.length - 1]);
      return copy;
    });
    setSel(null);
  }, []);

  const redo = useCallback(() => {
    setRedoStack((r) => {
      if (!r.length) return r;
      const copy = r.slice();
      const nxt = copy.pop()!;
      setUndoStack((s) => [...s, nxt]);
      setDoc(nxt);
      return copy;
    });
    setSel(null);
  }, []);

  /* ---------- derived ---------- */
  const warn = useMemo(() => computeWarnings(doc), [doc]);
  const warnCount = countHard(warn);

  const defGarage = useDeferredValue(doc.garage);
  const defStruct = useDeferredValue(doc.structure);
  const defTopRoad = useDeferredValue(doc.topRoad);
  const autoResults = useMemo(
    () => ({
      "auto-max": generateScenario(defGarage, defStruct, "max", { topRoad: defTopRoad }),
      "auto-comfort": generateScenario(defGarage, defStruct, "comfort", { topRoad: defTopRoad }),
      "auto-suv": generateScenario(defGarage, defStruct, "suv", { topRoad: defTopRoad }),
    }),
    [defGarage, defStruct, defTopRoad]
  );

  const scenarios: ScenarioCard[] = useMemo(() => {
    const surveyOpt = presetSurveyOptimal();
    const surveySafe = presetSurveyComfort();
    return [
      ...(["auto-max", "auto-comfort", "auto-suv"] as const).map((id) => {
        const r = autoResults[id];
        return {
          id,
          group: "auto" as const,
          title: id === "auto-max" ? t.scMax : id === "auto-comfort" ? t.scComfort : t.scSuv,
          desc: id === "auto-max" ? t.scMaxD : id === "auto-comfort" ? t.scComfortD : t.scSuvD,
          cars: r.stats.cars,
          flagged: r.stats.flagged,
          pmr: r.stats.pmr,
        };
      }),
      {
        id: "survey-opt",
        group: "survey" as const,
        title: t.scSurveyOpt,
        desc: t.scSurveyOptD,
        cars: surveyOpt.length,
        flagged: surveyOpt.filter((s) => s.flag).length,
        pmr: false,
      },
      {
        id: "survey-safe",
        group: "survey" as const,
        title: t.scSurveySafe,
        desc: t.scSurveySafeD,
        cars: surveySafe.length,
        flagged: 0,
        pmr: false,
      },
      {
        id: "survey-easy",
        group: "survey" as const,
        title: t.scEasy,
        desc: t.scEasyD,
        cars: presetSurveyEasy().length,
        flagged: presetSurveyEasy().filter((s) => s.flag).length,
        pmr: false,
      },
    ];
  }, [autoResults, t]);

  const selStall = sel && !sel.isStruct ? doc.stalls.find((s) => s.id === sel.id) : undefined;
  const selStruct = sel && sel.isStruct ? doc.structure.find((s) => s.id === sel.id) : undefined;

  useEffect(() => {
    if (sel && !selStall && !selStruct) setSel(null);
  }, [sel, selStall, selStruct]);

  /* ---------- actions ---------- */
  const editStalls = useCallback(
    (fn: (stalls: Stall[]) => Stall[], geometry = true) => {
      const d = docRef.current;
      commit({ ...d, stalls: fn(d.stalls.map((s) => ({ ...s, apts: [...s.apts] }))), dirty: geometry ? true : d.dirty });
    },
    [commit]
  );

  const rotSel = useCallback(
    (deg: number) => {
      if (!sel || sel.isStruct) return;
      editStalls((st) =>
        st.map((s) => (s.id === sel.id ? { ...s, rot: (((s.rot || 0) + deg) % 360 + 360) % 360 } : s))
      );
    },
    [sel, editStalls]
  );

  const deleteSel = useCallback(() => {
    if (!sel) return;
    const d = docRef.current;
    if (sel.isStruct) {
      commit({ ...d, structure: d.structure.filter((s) => s.id !== sel.id), dirty: true });
    } else {
      commit({ ...d, stalls: d.stalls.filter((s) => s.id !== sel.id), dirty: true });
    }
    setSel(null);
  }, [sel, commit]);

  const duplicateSel = useCallback(() => {
    if (!sel || sel.isStruct) return;
    const d = docRef.current;
    const src = d.stalls.find((s) => s.id === sel.id);
    if (!src) return;
    const copy: Stall = { ...src, id: uid(), cx: src.cx + 0.6, cy: src.cy + 0.6, apts: [] };
    commit({ ...d, stalls: [...d.stalls, copy], dirty: true });
    setSel({ id: copy.id, isStruct: false });
  }, [sel, commit]);

  const applyScenario = useCallback(
    (id: string) => {
      const d = docRef.current;
      let stalls: Stall[];
      let flow = d.flow;
      let topRoad = d.topRoad;
      if (id === "survey-opt") {
        stalls = presetSurveyOptimal();
        flow = surveyFlow();
        topRoad = false; // this layout parks on the north wall
      } else if (id === "survey-safe") {
        stalls = presetSurveyComfort();
        flow = surveyFlow();
        topRoad = false;
      } else if (id === "survey-easy") {
        stalls = presetSurveyEasy();
        flow = surveyEasyFlow();
        topRoad = true; // the north strip stays a through-road
      } else {
        const g = generateScenario(d.garage, d.structure, AUTO_IDS[id], { topRoad });
        stalls = g.stalls;
        flow = g.flow;
      }
      commit({ ...d, stalls, flow, scenarioId: id, dirty: false, topRoad });
      setSel(null);
      setPanelOpen(false);
      stageRef.current?.fit();
    },
    [commit]
  );

  const panelApi: PanelApi = useMemo(
    () => ({
      setStallField: (field, value) => {
        const d = docRef.current;
        if (sel?.isStruct) {
          commit({
            ...d,
            structure: d.structure.map((s) => {
              if (s.id !== sel.id) return s;
              if (field === "x") return { ...s, x: value };
              if (field === "y") return { ...s, y: value };
              if (field === "w") return { ...s, w: Math.max(0.2, value) };
              if (field === "l") return { ...s, h: Math.max(0.2, value) };
              return s;
            }),
            dirty: true,
          });
        } else if (sel) {
          commit({
            ...d,
            stalls: d.stalls.map((s) => {
              if (s.id !== sel.id) return s;
              if (field === "x") return { ...s, cx: value + s.w / 2 };
              if (field === "y") return { ...s, cy: value + s.l / 2 };
              if (field === "w") return { ...s, w: Math.max(0.2, value) };
              if (field === "l") return { ...s, l: Math.max(0.2, value) };
              if (field === "rot") return { ...s, rot: ((value % 360) + 360) % 360 };
              return s;
            }),
            dirty: true,
          });
        }
      },
      setStallType: (tp: StallTypeKey) => {
        if (!sel || sel.isStruct) return;
        const dTemplate = STALL_TYPES[tp];
        editStalls((st) => st.map((s) => (s.id === sel.id ? { ...s, tp, w: dTemplate.w, l: dTemplate.l } : s)));
      },
      setStallFlag: (flag) => {
        if (!sel || sel.isStruct) return;
        editStalls((st) => st.map((s) => (s.id === sel.id ? { ...s, flag } : s)), false);
      },
      toggleApt: (apt) => {
        if (!sel || sel.isStruct) return;
        const d = docRef.current;
        const stalls = d.stalls.map((s) => ({ ...s, apts: [...s.apts] }));
        const me = stalls.find((s) => s.id === sel.id);
        if (!me) return;
        if (me.apts.includes(apt)) {
          me.apts = me.apts.filter((a) => a !== apt);
        } else {
          for (const o of stalls) o.apts = o.apts.filter((a) => a !== apt);
          me.apts.push(apt);
          me.apts.sort((a, b) => a - b);
        }
        commit({ ...d, stalls });
      },
      setGarage: (patch) => {
        const d = docRef.current;
        const garage = { ...d.garage, ...patch };
        garage.laneW = Math.min(garage.laneW, garage.W);
        garage.laneH = Math.min(garage.laneH, garage.H);
        garage.exitY1 = Math.min(garage.exitY1, garage.H);
        let next: Doc = { ...d, garage };
        if (!d.dirty && d.scenarioId && AUTO_IDS[d.scenarioId]) {
          const g = generateScenario(garage, d.structure, AUTO_IDS[d.scenarioId], { topRoad: d.topRoad });
          next = { ...next, stalls: g.stalls, flow: g.flow };
        }
        commit(next);
      },
      setTopRoad: (v: boolean) => {
        const d = docRef.current;
        let next: Doc = { ...d, topRoad: v };
        if (!d.dirty && d.scenarioId && AUTO_IDS[d.scenarioId]) {
          const g = generateScenario(d.garage, d.structure, AUTO_IDS[d.scenarioId], { topRoad: v });
          next = { ...next, stalls: g.stalls, flow: g.flow };
        }
        commit(next);
      },
      resetStructure: () => {
        if (!window.confirm(t.confirmReset)) return;
        const base = newDoc();
        const d = docRef.current;
        let next: Doc = { ...d, garage: base.garage, structure: base.structure };
        if (!d.dirty && d.scenarioId && AUTO_IDS[d.scenarioId]) {
          const g = generateScenario(base.garage, base.structure, AUTO_IDS[d.scenarioId], {
            topRoad: d.topRoad,
          });
          next = { ...next, stalls: g.stalls, flow: g.flow };
        }
        commit(next);
        stageRef.current?.fit();
      },
      applyScenario,
      clearStalls: () => {
        if (!window.confirm(t.confirmClear)) return;
        const d = docRef.current;
        commit({ ...d, stalls: [], scenarioId: null, dirty: true });
        setSel(null);
      },
      setNapt: (n) => {
        const d = docRef.current;
        const napt = Math.max(1, Math.min(60, n || 16));
        commit({
          ...d,
          napt,
          stalls: d.stalls.map((s) => ({ ...s, apts: (s.apts || []).filter((a) => a <= napt) })),
        });
      },
      autoAssign: () => {
        const d = docRef.current;
        const stalls = d.stalls.map((s) => ({ ...s, apts: [] as number[] }));
        const ord = stalls.slice().sort((a, b) => a.cy - b.cy || a.cx - b.cx);
        if (!ord.length) return;
        for (let i = 0; i < Math.min(d.napt, ord.length); i++) ord[i].apts.push(i + 1);
        if (d.napt > ord.length) {
          const extra: number[] = [];
          for (let i = ord.length; i < d.napt; i++) extra.push(i + 1);
          const byArea = ord.slice().sort((a, b) => b.w * b.l - a.w * a.l);
          extra.forEach((apt, k) => byArea[k % byArea.length].apts.push(apt));
        }
        ord.forEach((s) => s.apts.sort((a, b) => a - b));
        commit({ ...d, stalls });
      },
      setOpt: (key, v) => setOpts((o) => ({ ...o, [key]: v })),
      exportPng: () => exportPNG(docRef.current, computeWarnings(docRef.current), opts, lang),
      exportJson: () => {
        const a = document.createElement("a");
        a.download = "plan-parking-garage.json";
        a.href = URL.createObjectURL(new Blob([docToJson(docRef.current)], { type: "application/json" }));
        a.click();
      },
      importJson: (file) => {
        file
          .text()
          .then((raw) => {
            const next = docFromJson(raw);
            commit(next);
            setSel(null);
            setPanelOpen(false);
            stageRef.current?.fit();
          })
          .catch(() => window.alert(t.badJson));
      },
    }),
    [sel, commit, editStalls, applyScenario, t, opts, lang]
  );

  const addStall = useCallback(
    (k: StallTypeKey) => {
      const c = stageRef.current?.centerWorld() ?? { x: 3, y: 3 };
      const tmpl = STALL_TYPES[k];
      const st: Stall = {
        id: uid(),
        cx: Math.round(c.x * 20) / 20,
        cy: Math.round(c.y * 20) / 20,
        w: tmpl.w,
        l: tmpl.l,
        rot: 0,
        tp: k,
        kind: "perp",
        flag: false,
        apts: [],
      };
      const d = docRef.current;
      commit({ ...d, stalls: [...d.stalls, st], dirty: true });
      setSel({ id: st.id, isStruct: false });
      setSheetOpen(false);
    },
    [commit]
  );

  const addObstacle = useCallback(
    (k: ObstacleTypeKey) => {
      const c = stageRef.current?.centerWorld() ?? { x: 3, y: 3 };
      const tmpl = OBSTACLE_TYPES[k];
      const item = {
        id: uid(),
        type: tmpl.type,
        x: Math.round((c.x - tmpl.w / 2) * 20) / 20,
        y: Math.round((c.y - tmpl.l / 2) * 20) / 20,
        w: tmpl.w,
        h: tmpl.l,
      };
      const d = docRef.current;
      commit({ ...d, structure: [...d.structure, item], dirty: true });
      setOpts((o) => ({ ...o, struct: true }));
      setSel({ id: item.id, isStruct: true });
      setSheetOpen(false);
    },
    [commit]
  );

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (!sel) return;
      const st = e.shiftKey ? 0.25 : 0.05;
      if (e.key === "Delete" || e.key === "Backspace") deleteSel();
      else if (e.key === "r" || e.key === "R") rotSel(90);
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0;
        const dy = e.key === "ArrowUp" ? -st : e.key === "ArrowDown" ? st : 0;
        const d = docRef.current;
        if (sel.isStruct) {
          commit({
            ...d,
            structure: d.structure.map((s) => (s.id === sel.id ? { ...s, x: s.x + dx, y: s.y + dy } : s)),
            dirty: true,
          });
        } else {
          commit({
            ...d,
            stalls: d.stalls.map((s) => (s.id === sel.id ? { ...s, cx: s.cx + dx, cy: s.cy + dy } : s)),
            dirty: true,
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, deleteSel, rotSel, undo, redo, commit]);

  /* ---------- pill ---------- */
  const pillLabel = selStall
    ? `${t[selStall.tp]} ${fmtM(selStall.w, lang)}×${fmtM(selStall.l, lang)}`
    : selStruct
      ? selStruct.lab === "wingL"
        ? t.wingL
        : selStruct.type
      : "";

  const pill = sel ? (
    <div className="flex items-center gap-1 rounded-full border border-white/10 bg-[#141F2C]/95 px-2 py-1.5 shadow-xl backdrop-blur">
      {selStall && (
        <>
          <PillBtn onClick={() => rotSel(-15)}>↺</PillBtn>
          <PillBtn onClick={() => rotSel(90)}>90°</PillBtn>
          <PillBtn onClick={() => rotSel(15)}>↻</PillBtn>
          <PillBtn onClick={() => setPanelOpen(true)}>🏠</PillBtn>
          <PillBtn onClick={duplicateSel}>⧉</PillBtn>
        </>
      )}
      <PillBtn onClick={deleteSel}>🗑</PillBtn>
      <span className="max-w-[130px] truncate px-1 text-[11px] text-slate-300">{pillLabel}</span>
    </div>
  ) : null;

  /* ---------- layout ---------- */
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#F6F7F4]">
      {/* header */}
      <header className="z-30 flex h-12 shrink-0 items-center gap-2 border-b border-black/30 bg-[#141F2C] px-3 text-slate-100">
        <button
          onClick={() => setLang(lang === "fr" ? "en" : "fr")}
          className="rounded-md border border-white/15 px-2 py-1 text-[11px] font-bold hover:bg-white/10"
        >
          {lang === "fr" ? "EN" : "FR"}
        </button>
        <div className="text-[13px] font-extrabold tracking-[0.18em]">{t.title}</div>
        <div className="ml-1 hidden text-[11px] text-slate-400 sm:block">
          {fmtM(doc.garage.W, lang)} × {fmtM(doc.garage.H, lang)} m
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] font-bold">
            🚗 {doc.stalls.length} · 🏠 {doc.napt}
          </span>
          {warnCount > 0 && (
            <span className="rounded-full bg-red-500/90 px-2.5 py-1 text-[11.5px] font-bold text-white">
              ⚠ {warnCount}
            </span>
          )}
          <button
            onClick={() => setPanelOpen(true)}
            className="rounded-md border border-white/15 px-2.5 py-1 text-[13px] hover:bg-white/10 lg:hidden"
          >
            ☰
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* stage */}
        <div className="relative min-w-0 flex-1">
          <CanvasStage
            ref={stageRef}
            doc={doc}
            warn={warn}
            opts={opts}
            lang={lang}
            sel={sel}
            tool={tool}
            pill={pill}
            onSelect={setSel}
            onLiveEdit={liveEdit}
            onCommitEdit={commitLive}
            onDoubleTapStall={() => rotSel(90)}
          />

          {/* zoom / history cluster */}
          <div className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5">
            {(
              [
                ["+", () => stageRef.current?.zoomBy(1.25)],
                ["⛶", () => stageRef.current?.fit()],
                ["−", () => stageRef.current?.zoomBy(0.8)],
                ["↶", undo],
                ["↷", redo],
              ] as const
            ).map(([lbl, fn], i) => (
              <button
                key={i}
                onClick={fn}
                disabled={(lbl === "↶" && undoStack.length < 2) || (lbl === "↷" && !redoStack.length)}
                className="h-9 w-9 rounded-lg border border-black/15 bg-white/90 text-[15px] font-bold text-[#23446E] shadow-sm backdrop-blur hover:bg-white disabled:opacity-35"
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* dock */}
          <nav className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-black/10 bg-[#141F2C]/95 p-1.5 shadow-2xl backdrop-blur">
            <DockBtn active={tool === "sel"} onClick={() => setTool("sel")} icon="✥" label={t.select} />
            <DockBtn active={sheetOpen} onClick={() => setSheetOpen(true)} icon="＋" label={t.add} />
            <DockBtn active={tool === "measure"} onClick={() => setTool(tool === "measure" ? "sel" : "measure")} icon="📏" label={t.measure} />
            <DockBtn active={false} onClick={panelApi.exportPng} icon="🖼" label={t.png} />
          </nav>
        </div>

        {/* desktop panel */}
        <aside className="hidden w-[340px] shrink-0 border-l border-black/40 lg:block">
          <Panel doc={doc} warn={warn} lang={lang} opts={opts} sel={sel ? { stall: selStall, struct: selStruct } : null} scenarios={scenarios} api={panelApi} />
        </aside>
      </div>

      {/* mobile panel overlay */}
      {panelOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setPanelOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-[min(88vw,370px)] shadow-2xl lg:hidden">
            <div className="flex h-11 items-center justify-between bg-[#101825] px-4 text-slate-100">
              <b className="text-[12px] tracking-[0.14em]">{t.panel}</b>
              <button onClick={() => setPanelOpen(false)} className="px-2 text-[15px]">
                ✕
              </button>
            </div>
            <div className="h-[calc(100%-2.75rem)]">
              <Panel doc={doc} warn={warn} lang={lang} opts={opts} sel={sel ? { stall: selStall, struct: selStruct } : null} scenarios={scenarios} api={panelApi} />
            </div>
          </div>
        </>
      )}

      {/* add sheet */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setSheetOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-[#16202E] p-4 text-slate-100 shadow-2xl lg:left-1/2 lg:right-auto lg:w-[560px] lg:-translate-x-1/2">
            <div className="mb-2 text-[11px] font-bold tracking-[0.14em] text-slate-400">{t.addstall}</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(STALL_TYPES) as StallTypeKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => addStall(k)}
                  className="rounded-lg border border-white/10 bg-slate-800 px-2 py-2.5 text-center hover:border-amber-400/50"
                >
                  <div className="text-[13px] font-bold">{t[k]}</div>
                  <div className="text-[11px] text-slate-400">
                    {fmtM(STALL_TYPES[k].w, lang)} × {fmtM(STALL_TYPES[k].l, lang)} m
                  </div>
                </button>
              ))}
            </div>
            <div className="mb-2 mt-4 text-[11px] font-bold tracking-[0.14em] text-slate-400">{t.addobs}</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(OBSTACLE_TYPES) as ObstacleTypeKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => addObstacle(k)}
                  className="rounded-lg border border-white/10 bg-slate-800 px-2 py-2.5 text-center hover:border-amber-400/50"
                >
                  <div className="text-[13px] font-bold">{t[k]}</div>
                  <div className="text-[11px] text-slate-400">
                    {fmtM(OBSTACLE_TYPES[k].w, lang)} × {fmtM(OBSTACLE_TYPES[k].l, lang)} m
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DockBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex min-w-[64px] flex-col items-center rounded-xl px-3 py-1.5 text-[10.5px] font-semibold transition-colors ${
        active ? "bg-amber-500 text-slate-900" : "text-slate-300 hover:bg-white/10"
      }`}
    >
      <span className="text-[15px] leading-5">{icon}</span>
      {label}
    </button>
  );
}

function PillBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="h-8 min-w-8 rounded-full px-1.5 text-[13px] text-slate-100 hover:bg-white/15"
    >
      {children}
    </button>
  );
}
