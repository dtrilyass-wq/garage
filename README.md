# Garage Planner v3

Parking planner for a residential garage (default: the surveyed **17.60 × 29.75 m** garage
with a west exit lane, serving **16 apartments**) — rebuilt as a Next.js + React + TypeScript app.

## Run

```bash
npm install
npm run dev        # dev server (Turbopack) → http://localhost:3000
npm run preview    # production build + serve → http://localhost:3000 (most stable)
npm test           # engine unit tests (vitest)
```

Requires Node ≥ 20. If the dev server ever serves an unstyled page after many
hot reloads, stop it and `rm -rf .next`, then start again — or use `npm run preview`.

## What it does

- **Pre-made safe layouts.** Three scenarios are *generated live* for the current garage
  (`Auto optimum`, `Auto comfort`, `Auto family/SUV`) plus the two hand-surveyed layouts
  (13 / 11 cars). The generator respects the house rules: one-way aisle ≥ 3.00 m,
  ≥ 5.00–5.50 m in front of 90° stalls, +30 cm width against walls/columns, doors kept
  clear, stalls aligned between columns, and a reachability check (BFS from the exit
  opening with 0.90 m vehicle clearance) so no stall is ever generated in an unreachable
  pocket. Tight-but-legal stalls are flagged « manœuvre délicate ».
- **Resizable garage.** Width / depth / exit opening / exit-lane length are editable in the
  GARAGE panel. While an auto scenario is active, the layout regenerates instantly on resize;
  scenario cards always show live capacities for the current envelope.
- **Through-road option (easy in/out).** A toggle in SCENARIOS turns the whole top strip
  (where stalls 1–2 used to be) into a full-width driving lane kept clear of stalls: straight
  run in and out, easy turning, plus a reserved descent at the east end so circulation is a
  real loop (road → east side → around → straight run back out). Applies to all auto
  scenarios; the surveyed « Easy access — 11 cars » layout is the hand-drawn equivalent.
- **Full editor.** Drag / rotate / resize / duplicate stalls, add stalls (compact → XL, PMR,
  moto) and obstacles (columns, walls, no-parking zones), edit the structure, measure tool,
  5 cm snap, pan/pinch/wheel zoom, undo/redo, keyboard nudging.
- **Apartment assignment.** Chips per stall, auto-distribution across N apartments,
  shared-stall tracking, unassigned list.
- **Warnings.** Red: outside walls, overlapping, on the exit lane, blocking a door.
  Orange (clearances layer): manoeuvring apron constrained.
- **Export.** High-res PNG plan with title block + marking table (X/Y from the west/north
  walls for painting the lines), JSON save/load (v2 files import fine), autosave to
  localStorage, FR/EN.

## Code map

- `src/lib/generate.ts` — scenario generator (supports, segment fill, aprons, reachability)
- `src/lib/model.ts` — data model, surveyed structure & presets, stall templates
- `src/lib/render.ts` — canvas renderer (screen + PNG export share it)
- `src/lib/warnings.ts` / `geom.ts` — OBB collision, aprons, warnings
- `src/components/Planner.tsx` — state, history, scenarios, panels
- `src/components/CanvasStage.tsx` — pointer interactions
- `garage-parking-planner-v2.html` — the previous single-file version (kept for reference)
