"use client";

import { useRef, useState } from "react";
import type { Doc, Lang, Stall, StallTypeKey, StructItem } from "@/lib/model";
import { STALL_TYPES } from "@/lib/model";
import { fmtM, tr } from "@/lib/i18n";
import type { WarningMap } from "@/lib/warnings";

export interface ScenarioCard {
  id: string;
  group: "auto" | "survey";
  title: string;
  desc: string;
  cars: number;
  flagged: number;
  pmr: boolean;
}

export interface PanelApi {
  setStallField: (field: "x" | "y" | "w" | "l" | "rot", value: number) => void;
  setStallType: (tp: StallTypeKey) => void;
  setStallFlag: (flag: boolean) => void;
  toggleApt: (apt: number) => void;
  setGarage: (patch: Partial<Doc["garage"]>) => void;
  setTopRoad: (v: boolean) => void;
  resetStructure: () => void;
  applyScenario: (id: string) => void;
  clearStalls: () => void;
  setNapt: (n: number) => void;
  autoAssign: () => void;
  setOpt: (key: keyof PanelProps["opts"], v: boolean) => void;
  exportPng: () => void;
  exportJson: () => void;
  importJson: (file: File) => void;
}

interface PanelProps {
  doc: Doc;
  warn: WarningMap;
  lang: Lang;
  opts: {
    grid: boolean;
    dims: boolean;
    sdims: boolean;
    flow: boolean;
    safe: boolean;
    clear: boolean;
    snap: boolean;
    struct: boolean;
  };
  sel: { stall?: Stall; struct?: StructItem } | null;
  scenarios: ScenarioCard[];
  api: PanelApi;
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/10 px-4 py-4">
      <div className="mb-3 text-[11px] font-bold tracking-[0.14em] text-slate-400">{title}</div>
      {children}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-[5px] text-[13px] text-slate-200">
      <span>{label}</span>
      <span
        className={`relative inline-block h-[20px] w-[36px] shrink-0 rounded-full transition-colors ${on ? "bg-amber-500" : "bg-slate-600"}`}
      >
        <input type="checkbox" className="peer sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <i
          className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-[2px]"}`}
        />
      </span>
    </label>
  );
}

/* Numeric field that commits on blur / Enter (like v2's `change` handler) —
   committing per keystroke would resize the garage mid-typing and flood the
   undo history. */
function Num({
  label,
  value,
  step,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(Number.isFinite(value) ? Number(value.toFixed(2)) : 0);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    let v = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(v)) return;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    if (Math.abs(v - value) > 1e-9) onChange(v);
  };
  return (
    <label className="flex flex-col gap-1 text-[11px] text-slate-400">
      <span>{label}</span>
      <input
        type="number"
        className="w-full rounded-md border border-white/15 bg-slate-900/70 px-2 py-1.5 text-[13px] text-slate-100 outline-none focus:border-amber-400"
        value={shown}
        step={step ?? 0.05}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

export function Panel({ doc, lang, opts, sel, scenarios, api }: PanelProps) {
  const t = tr(lang);
  const fileRef = useRef<HTMLInputElement>(null);

  const stall = sel?.stall;
  const struct = sel?.struct;

  /* apartment usage map for chips */
  const takenBy = new Map<number, string>();
  for (const s of doc.stalls) for (const a of s.apts || []) if (!stall || s.id !== stall.id) takenBy.set(a, s.id);

  const byType: Record<string, number> = {};
  for (const s of doc.stalls) byType[s.tp] = (byType[s.tp] || 0) + 1;
  const cls =
    Object.keys(byType)
      .map((k) => `${t[k as StallTypeKey]}: ${byType[k]}`)
      .join(" · ") || "—";
  const flags = doc.stalls.filter((s) => s.flag).length;
  const sharedCount = doc.stalls.filter((s) => (s.apts || []).length > 1).length;

  const used = new Set<number>();
  doc.stalls.forEach((s) => (s.apts || []).forEach((a) => used.add(a)));
  const unassigned: number[] = [];
  for (let i = 1; i <= doc.napt; i++) if (!used.has(i)) unassigned.push(i);
  const ordered = doc.stalls.slice().sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const aptLines = ordered
    .map((s, i) =>
      (s.apts || []).length
        ? `${t.stall} ${i + 1} → ${s.apts.map((a) => `${t.aptShort} ${a}`).join(" + ")}${s.apts.length > 1 ? ` (${t.shared})` : ""}`
        : null
    )
    .filter(Boolean) as string[];

  const showRegenHint = doc.dirty;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#16202E] text-slate-100">
      {/* SELECTION */}
      <Sec title={t.selection}>
        {!stall && !struct && <div className="text-[13px] text-slate-400">{t.selnone}</div>}
        {(stall || struct) && (
          <div className="flex flex-col gap-3">
            {stall && (
              <label className="flex flex-col gap-1 text-[11px] text-slate-400">
                <span>{t.ptype}</span>
                <select
                  className="w-full rounded-md border border-white/15 bg-slate-900/70 px-2 py-1.5 text-[13px] text-slate-100 outline-none focus:border-amber-400"
                  value={stall.tp}
                  onChange={(e) => api.setStallType(e.target.value as StallTypeKey)}
                >
                  {(Object.keys(STALL_TYPES) as StallTypeKey[]).map((k) => (
                    <option key={k} value={k}>
                      {t[k]} {STALL_TYPES[k].w}×{STALL_TYPES[k].l}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Num
                label="X (m)"
                value={stall ? stall.cx - stall.w / 2 : struct!.x}
                onChange={(v) => api.setStallField("x", v)}
              />
              <Num
                label="Y (m)"
                value={stall ? stall.cy - stall.l / 2 : struct!.y}
                onChange={(v) => api.setStallField("y", v)}
              />
              <Num label={t.width} value={stall ? stall.w : struct!.w} onChange={(v) => api.setStallField("w", v)} />
              <Num label={t.length} value={stall ? stall.l : struct!.h} onChange={(v) => api.setStallField("l", v)} />
              {stall && (
                <Num label="Rotation (°)" value={stall.rot} step={5} onChange={(v) => api.setStallField("rot", v)} />
              )}
            </div>
            {stall && (
              <Toggle label={t.flag} on={!!stall.flag} onChange={(v) => api.setStallFlag(v)} />
            )}
            {stall && (
              <div>
                <div className="mb-2 text-[11px] text-slate-400">{t.aptassign}</div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: doc.napt }, (_, i) => i + 1).map((a) => {
                    const mine = (stall.apts || []).includes(a);
                    const taken = !mine && takenBy.has(a);
                    return (
                      <button
                        key={a}
                        onClick={() => api.toggleApt(a)}
                        className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                          mine
                            ? "bg-emerald-500 text-white"
                            : taken
                              ? "bg-slate-700/60 text-slate-500"
                              : "bg-slate-700 text-slate-200 hover:bg-slate-600"
                        }`}
                      >
                        A{a}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Sec>

      {/* GARAGE */}
      <Sec title={t.garage}>
        <div className="grid grid-cols-2 gap-2">
          <Num label={t.gW} value={doc.garage.W} step={0.05} min={5} max={80} onChange={(v) => api.setGarage({ W: Math.max(5, Math.min(80, v)) })} />
          <Num label={t.gH} value={doc.garage.H} step={0.05} min={5} max={120} onChange={(v) => api.setGarage({ H: Math.max(5, Math.min(120, v)) })} />
          <Num
            label={t.gExit}
            value={doc.garage.exitY1 - doc.garage.exitY0}
            step={0.05}
            min={2.2}
            onChange={(v) => api.setGarage({ exitY1: doc.garage.exitY0 + Math.max(2.2, v) })}
          />
          <Num label={t.gLaneW} value={doc.garage.laneW} step={0.05} min={0} onChange={(v) => api.setGarage({ laneW: Math.max(0, v) })} />
        </div>
        <div className="mt-2 text-[11px] leading-relaxed text-slate-500">{t.gHint}</div>
        <button
          onClick={api.resetStructure}
          className="mt-2 w-full rounded-lg border border-white/15 bg-slate-800 px-3 py-2 text-[13px] font-semibold text-slate-200 hover:bg-slate-700"
        >
          {t.gReset}
        </button>
      </Sec>

      {/* SCENARIOS */}
      <Sec title={t.presets}>
        {showRegenHint && (
          <div className="mb-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-200">
            {t.regenHint}
          </div>
        )}
        <div className="mb-2 rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2">
          <Toggle label={t.topRoadL} on={doc.topRoad} onChange={(v) => api.setTopRoad(v)} />
          <div className="mt-1 text-[10.5px] leading-relaxed text-slate-500">{t.topRoadHint}</div>
        </div>
        <div className="mb-1 text-[11px] font-semibold text-slate-500">{t.scenAuto}</div>
        <div className="flex flex-col gap-2">
          {scenarios
            .filter((s) => s.group === "auto")
            .map((s) => (
              <ScenarioButton key={s.id} s={s} active={doc.scenarioId === s.id && !doc.dirty} lang={lang} onClick={() => api.applyScenario(s.id)} />
            ))}
        </div>
        <div className="mt-3 mb-1 text-[11px] font-semibold text-slate-500">{t.scenSurvey}</div>
        <div className="flex flex-col gap-2">
          {scenarios
            .filter((s) => s.group === "survey")
            .map((s) => (
              <ScenarioButton key={s.id} s={s} active={doc.scenarioId === s.id && !doc.dirty} lang={lang} onClick={() => api.applyScenario(s.id)} />
            ))}
        </div>
        <button
          onClick={api.clearStalls}
          className="mt-3 w-full rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[13px] font-semibold text-red-300 hover:bg-red-500/20"
        >
          {t.pclear}
        </button>
      </Sec>

      {/* APARTMENTS */}
      <Sec title={t.apts}>
        <div className="flex items-end gap-2">
          <Num label={t.naptl} value={doc.napt} step={1} min={1} max={60} onChange={(v) => api.setNapt(Math.round(v))} />
          <button
            onClick={api.autoAssign}
            className="h-[34px] flex-1 rounded-lg bg-amber-500 px-3 text-[13px] font-bold text-slate-900 hover:bg-amber-400"
          >
            {t.autoapt}
          </button>
        </div>
        <div className="mt-3 space-y-1 text-[12px] leading-relaxed text-slate-300">
          {unassigned.length > 0 && (
            <div className="text-red-300">
              {t.unass}: {unassigned.join(", ")}
            </div>
          )}
          {aptLines.length ? aptLines.map((l, i) => <div key={i}>{l}</div>) : <div>—</div>}
        </div>
      </Sec>

      {/* DISPLAY */}
      <Sec title={t.layers}>
        <Toggle label={t.lgrid} on={opts.grid} onChange={(v) => api.setOpt("grid", v)} />
        <Toggle label={t.ldims} on={opts.dims} onChange={(v) => api.setOpt("dims", v)} />
        <Toggle label={t.lsdims} on={opts.sdims} onChange={(v) => api.setOpt("sdims", v)} />
        <Toggle label={t.lflow} on={opts.flow} onChange={(v) => api.setOpt("flow", v)} />
        <Toggle label={t.lsafe} on={opts.safe} onChange={(v) => api.setOpt("safe", v)} />
        <Toggle label={t.lclear} on={opts.clear} onChange={(v) => api.setOpt("clear", v)} />
        <Toggle label={t.lsnap} on={opts.snap} onChange={(v) => api.setOpt("snap", v)} />
        <Toggle label={t.lstruct} on={opts.struct} onChange={(v) => api.setOpt("struct", v)} />
      </Sec>

      {/* CAPACITY */}
      <Sec title={t.capacity}>
        <div
          className="text-[12.5px] leading-relaxed text-slate-300 [&_b]:text-amber-300"
          dangerouslySetInnerHTML={{
            __html: t.cap(doc.stalls.length, flags, cls, sharedCount).replace(/\n/g, "<br>"),
          }}
        />
      </Sec>

      {/* EXPORT */}
      <Sec title="EXPORT">
        <div className="flex flex-col gap-2">
          <button onClick={api.exportPng} className="rounded-lg bg-slate-700 px-3 py-2 text-[13px] font-semibold text-slate-100 hover:bg-slate-600">
            {t.epng}
          </button>
          <button onClick={api.exportJson} className="rounded-lg bg-slate-700 px-3 py-2 text-[13px] font-semibold text-slate-100 hover:bg-slate-600">
            {t.ejson}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg bg-slate-700 px-3 py-2 text-[13px] font-semibold text-slate-100 hover:bg-slate-600"
          >
            {t.ijson}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) api.importJson(f);
              e.target.value = "";
            }}
          />
        </div>
      </Sec>

      {/* RULES */}
      <Sec title={t.rules}>
        {(
          [
            [t.r1t, t.r1],
            [t.r2t, t.r2],
            [t.r3t, t.r3],
          ] as const
        ).map(([title, html], i) => (
          <details key={i} className="group mb-1.5 rounded-lg border border-white/10 bg-slate-900/40">
            <summary className="cursor-pointer list-none px-3 py-2 text-[12.5px] font-semibold text-slate-200">
              {title}
            </summary>
            <div
              className="px-3 pb-3 text-[12px] leading-relaxed text-slate-400 [&_b]:text-slate-200"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </details>
        ))}
        <div className="pb-6 pt-2 text-center text-[10px] text-slate-600">
          Garage Planner v3 · {fmtM(doc.garage.W, lang)} × {fmtM(doc.garage.H, lang)} m
        </div>
      </Sec>
    </div>
  );
}

function ScenarioButton({
  s,
  active,
  lang,
  onClick,
}: {
  s: ScenarioCard;
  active: boolean;
  lang: Lang;
  onClick: () => void;
}) {
  const t = tr(lang);
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
        active
          ? "border-amber-400/70 bg-amber-400/10"
          : "border-white/10 bg-slate-800/70 hover:border-white/25 hover:bg-slate-800"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-slate-100">{s.title}</span>
        <span className="shrink-0 rounded-md bg-slate-900/80 px-2 py-0.5 text-[12px] font-bold text-amber-300">
          🚗 {s.cars}
        </span>
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-slate-400">{s.desc}</div>
      <div className="mt-1 flex gap-2 text-[10.5px] text-slate-500">
        {s.flagged > 0 && <span className="text-amber-500/90">⚠ {s.flagged} {t.flagged}</span>}
        {s.pmr && <span className="text-blue-300/90">♿ {t.pmrIncl}</span>}
      </div>
    </button>
  );
}
