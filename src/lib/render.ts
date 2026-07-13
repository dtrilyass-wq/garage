/* Canvas renderer — ported from v2, generalized to a variable garage. */

import type { Doc, Lang, Stall, StructItem } from "./model";
import { RULES } from "./model";
import { cornersOf, entryApron, rad, sideAprons, type Pt } from "./geom";
import { fmtM, tr } from "./i18n";
import type { WarningMap } from "./warnings";

export interface View {
  S: number; // px per meter
  ox: number;
  oy: number;
}

export interface LayerOpts {
  grid: boolean;
  dims: boolean;
  sdims: boolean;
  flow: boolean;
  safe: boolean;
  clear: boolean;
  snap: boolean;
  struct: boolean;
}

export interface Selection {
  id: string;
  isStruct: boolean;
}

export interface Measure {
  a: Pt;
  b: Pt | null;
}

export const INK = "#23446E";
export const INK2 = "#7288A8";
export const PAPER = "#F6F7F4";
export const ACCENT = "#F3A73B";
export const DANGER = "#D6483C";
export const MONO = "ui-monospace,Menlo,Consolas,monospace";

function hatch(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, S: number, gap: number, color: string) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.strokeStyle = color;
  c.lineWidth = 1;
  const g = gap * S;
  for (let d = -h; d < w + h; d += g) {
    c.beginPath();
    c.moveTo(x + d, y + h);
    c.lineTo(x + d + h, y);
    c.stroke();
  }
  c.restore();
}

function arrow(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, hw: number) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - hw * Math.cos(a - 0.42), y2 - hw * Math.sin(a - 0.42));
  c.lineTo(x2 - hw * Math.cos(a + 0.42), y2 - hw * Math.sin(a + 0.42));
  c.closePath();
  c.fill();
}

function dim(c: CanvasRenderingContext2D, v: string, x1: number, y1: number, x2: number, y2: number, off: number, S: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * off * S;
  const ny = (dx / L) * off * S;
  const ax1 = x1 + nx;
  const ay1 = y1 + ny;
  const ax2 = x2 + nx;
  const ay2 = y2 + ny;
  c.strokeStyle = INK2;
  c.fillStyle = INK2;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(ax1, ay1);
  c.moveTo(x2, y2);
  c.lineTo(ax2, ay2);
  c.stroke();
  arrow(c, (ax1 + ax2) / 2, (ay1 + ay2) / 2, ax1, ay1, 6);
  arrow(c, (ax1 + ax2) / 2, (ay1 + ay2) / 2, ax2, ay2, 6);
  c.beginPath();
  c.moveTo(ax1, ay1);
  c.lineTo(ax2, ay2);
  c.stroke();
  const fs = Math.max(9, Math.min(13, 0.3 * S));
  c.font = `${fs}px ${MONO}`;
  c.save();
  c.translate((ax1 + ax2) / 2, (ay1 + ay2) / 2);
  let ang = Math.atan2(ay2 - ay1, ax2 - ax1);
  if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
  c.rotate(ang);
  c.textAlign = "center";
  c.textBaseline = "bottom";
  c.fillText(v, 0, -3);
  c.restore();
}

function label(
  c: CanvasRenderingContext2D,
  txt: string,
  x: number,
  y: number,
  fs: number,
  color: string,
  bold?: boolean,
  angle?: number
) {
  c.save();
  c.translate(x, y);
  if (angle) c.rotate(angle);
  c.font = `${bold ? "700 " : ""}${fs}px ${MONO}`;
  c.fillStyle = color;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(txt, 0, 0);
  c.restore();
}

export function stallOrder(stalls: Stall[]): Stall[] {
  return stalls.slice().sort((a, b) => a.cy - b.cy || a.cx - b.cx);
}

function byId(structure: StructItem[], id: string): StructItem | undefined {
  return structure.find((s) => s.id === id);
}

export function drawScene(
  c: CanvasRenderingContext2D,
  v: View,
  doc: Doc,
  warn: WarningMap,
  opts: LayerOpts,
  lang: Lang,
  sel: Selection | null,
  measure: Measure | null,
  printMode: boolean
): void {
  const t = tr(lang);
  const { W: GW, H: GH } = doc.garage;
  const S = v.S;
  const X = (x: number) => v.ox + x * S;
  const Y = (y: number) => v.oy + y * S;
  const lane = {
    x: 0,
    y: 0,
    w: Math.min(doc.topRoad ? GW : doc.garage.laneW, GW),
    h: Math.min(doc.garage.laneH, GH),
  };
  const exitY0 = doc.garage.exitY0;
  const exitY1 = Math.min(doc.garage.exitY1, GH);

  c.fillStyle = PAPER;
  c.fillRect(X(-3), Y(-3), (GW + 6) * S, (GH + 6) * S);
  if (opts.grid || printMode) {
    c.lineWidth = 1;
    for (let i = 0; i <= Math.floor(GW); i += 1) {
      c.strokeStyle = i % 5 ? "#E7ECE6" : "#D5DDD4";
      c.beginPath();
      c.moveTo(X(i), Y(0));
      c.lineTo(X(i), Y(GH));
      c.stroke();
    }
    for (let j = 0; j <= Math.floor(GH); j += 1) {
      c.strokeStyle = j % 5 ? "#E7ECE6" : "#D5DDD4";
      c.beginPath();
      c.moveTo(X(0), Y(j));
      c.lineTo(X(GW), Y(j));
      c.stroke();
    }
  }

  /* exit lane (keep clear) */
  if (lane.w > 0.1 && lane.h > 0.1) {
    hatch(c, X(lane.x), Y(lane.y), lane.w * S, lane.h * S, S, 0.6, "#C4CFDE");
    c.setLineDash([6, 5]);
    c.strokeStyle = "#8FA2BC";
    c.lineWidth = 1.2;
    c.strokeRect(X(lane.x) + 1, Y(lane.y) + 1, lane.w * S - 2, lane.h * S - 2);
    c.setLineDash([]);
    label(c, t.laneL, X(lane.w / 2), Y(lane.h - 0.52), Math.max(8, 0.26 * S), "#5A749B");
    /* exit arrow */
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineWidth = Math.max(2.5, 0.09 * S);
    const ay = (exitY0 + exitY1) / 2 || lane.h / 2;
    arrow(c, X(Math.min(5.4, lane.w * 0.45)), Y(ay - 0.25), X(0.7), Y(ay - 0.25), Math.max(10, 0.38 * S));
    label(c, "← " + t.exitL, X(Math.min(3.3, lane.w * 0.28)), Y(Math.max(0.6, ay - 1.1)), Math.max(11, 0.44 * S), INK, true);
  }

  /* outer walls */
  c.strokeStyle = INK;
  c.lineWidth = Math.max(2.5, 0.1 * S);
  c.strokeRect(X(0), Y(0), GW * S, GH * S);

  /* west wall opening */
  if (exitY1 - exitY0 > 0.2) {
    c.strokeStyle = PAPER;
    c.lineWidth = Math.max(2.5, 0.1 * S) + 3;
    c.beginPath();
    c.moveTo(X(0), Y(exitY0 + 0.12));
    c.lineTo(X(0), Y(exitY1 - 0.06));
    c.stroke();
    c.strokeStyle = ACCENT;
    c.lineWidth = Math.max(3, 0.12 * S);
    c.setLineDash([S * 0.35, S * 0.22]);
    c.beginPath();
    c.moveTo(X(0), Y(exitY0 + 0.12));
    c.lineTo(X(0), Y(exitY1 - 0.06));
    c.stroke();
    c.setLineDash([]);
    label(c, fmtM(exitY1 - exitY0, lang), X(0.45), Y((exitY0 + exitY1) / 2), Math.max(9, 0.3 * S), "#C87F14", true, -Math.PI / 2);
  }

  /* structure */
  for (const st of doc.structure) {
    const x = X(st.x);
    const y = Y(st.y);
    const w = st.w * S;
    const h = st.h * S;
    if (st.type === "core") {
      c.fillStyle = "#E3E9F2";
      c.fillRect(x, y, w, h);
      hatch(c, x, y, w, h, S, 0.8, "#C4CFDE");
      c.strokeStyle = INK;
      c.lineWidth = Math.max(2, 0.08 * S);
      c.strokeRect(x, y, w, h);
      if (st.id === "coreA")
        label(c, t.coreL, X(st.x + st.w / 2), Y(st.y + st.h / 2), Math.max(8, 0.26 * S), INK, true, -Math.PI / 2);
    } else if (st.type === "wall") {
      c.fillStyle = "#D9E0EA";
      c.fillRect(x, y, w, h);
      c.strokeStyle = INK;
      c.lineWidth = Math.max(1.5, 0.05 * S);
      c.strokeRect(x, y, w, h);
      if (st.lab)
        label(
          c,
          st.lab === "wingL" ? t.wingL : st.lab,
          X(st.x + st.w / 2),
          Y(st.y + st.h / 2),
          Math.max(7, 0.2 * S),
          "#43608C",
          false,
          st.h > st.w ? -Math.PI / 2 : 0
        );
    } else if (st.type === "col") {
      c.fillStyle = INK;
      c.fillRect(x, y, w, h);
    } else if (st.type === "door") {
      c.strokeStyle = "#3E9B6E";
      c.lineWidth = 1.4;
      c.setLineDash([4, 3]);
      c.strokeRect(x, y, w, h);
      c.setLineDash([]);
      label(c, t.doorL, X(st.x + st.w / 2), Y(st.y + st.h / 2), Math.max(9, 0.3 * S), "#2F7D57", true);
    } else if (st.type === "nozone") {
      hatch(c, x, y, w, h, S, 0.5, "#D98A83");
      c.strokeStyle = "#C05248";
      c.lineWidth = 1.5;
      c.setLineDash([6, 4]);
      c.strokeRect(x, y, w, h);
      c.setLineDash([]);
    }
    if (opts.struct && sel && sel.isStruct && sel.id === st.id) {
      c.strokeStyle = ACCENT;
      c.lineWidth = 2;
      c.setLineDash([5, 4]);
      c.strokeRect(x - 3, y - 3, w + 6, h + 6);
      c.setLineDash([]);
    }
  }

  /* flow */
  if (opts.flow && doc.flow) {
    c.strokeStyle = "rgba(35,68,110,.5)";
    c.fillStyle = "rgba(35,68,110,.5)";
    c.lineWidth = Math.max(2, 0.08 * S);
    c.setLineDash([S * 0.5, S * 0.35]);
    const hw = Math.max(9, 0.33 * S);
    for (const f of doc.flow) {
      arrow(c, X(f.x1), Y(f.y1), X(f.x2), Y(f.y2), hw);
    }
    c.setLineDash([]);
    const lbl = doc.flow.find((f) => f.oneWayLabel);
    if (lbl)
      label(
        c,
        t.oneway,
        X(lbl.x1) - (lbl.x1 === lbl.x2 ? 0 : 0),
        Y((lbl.y1 + lbl.y2) / 2),
        Math.max(8, 0.26 * S),
        "rgba(35,68,110,.6)",
        true,
        lbl.x1 === lbl.x2 ? -Math.PI / 2 : 0
      );
  }

  /* safety */
  if (opts.safe) {
    const d1 = byId(doc.structure, "d1");
    const ext = (ex: number, ey: number) => {
      if (ex < 0.4 || ey < 0.4 || ex > GW - 0.4 || ey > GH - 0.4) return;
      c.fillStyle = DANGER;
      c.beginPath();
      c.arc(X(ex), Y(ey), Math.max(5, 0.16 * S), 0, 7);
      c.fill();
      label(c, "EXT", X(ex), Y(ey), Math.max(6, 0.14 * S), "#fff", true);
    };
    if (d1) ext(d1.x + 0.75, d1.y - 0.45);
    ext(1.0, lane.h + 0.83);
    const mir = (mx: number, my: number) => {
      if (mx < 0.3 || my < 0.3 || mx > GW - 0.3 || my > GH - 0.3) return;
      c.strokeStyle = ACCENT;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(X(mx), Y(my), Math.max(6, 0.2 * S), 0, 7);
      c.stroke();
      label(c, "M", X(mx), Y(my), Math.max(7, 0.18 * S), "#C87F14", true);
    };
    mir(0.55, lane.h + 0.28);
    const cT2 = byId(doc.structure, "cT2");
    mir(cT2 ? cT2.x + 0.33 : Math.max(1, lane.w - 0.2), lane.h + 0.63);
    if (d1) {
      const px = Math.max(0.9, Math.min(3.0, d1.x - 3.4));
      const py = Math.max(0.8, (exitY0 + exitY1) / 2 - 0.1);
      c.strokeStyle = "#3E9B6E";
      c.lineWidth = 1.4;
      c.setLineDash([2, 4]);
      c.beginPath();
      c.moveTo(X(d1.x), Y(d1.y + 0.55));
      c.lineTo(X(px), Y(d1.y + 0.55));
      c.lineTo(X(px), Y(py));
      c.lineTo(X(0.4), Y(py));
      c.stroke();
      c.setLineDash([]);
      label(c, t.ped, X(px + 0.35), Y((d1.y + py) / 2), Math.max(7, 0.2 * S), "#2F7D57", false, -Math.PI / 2);
    }
  }

  /* stalls */
  const ordered = stallOrder(doc.stalls);
  const numOf = new Map<string, string>();
  ordered.forEach((s, i) => numOf.set(s.id, String(i + 1)));
  for (const s of doc.stalls) {
    const wrn = warn[s.id];
    const bad = !!wrn && wrn.hard.length > 0;
    const soft = !!wrn && wrn.soft.length > 0;
    c.save();
    c.translate(X(s.cx), Y(s.cy));
    c.rotate(rad(s.rot || 0));
    const hw = (s.w / 2) * S;
    const hl = (s.l / 2) * S;
    if (opts.clear) {
      c.setLineDash([4, 4]);
      c.strokeStyle = "rgba(243,167,59,.65)";
      c.lineWidth = 1;
      c.strokeRect(-hw - 0.25 * S, -hl - 0.25 * S, (s.w + 0.5) * S, (s.l + 0.5) * S);
      c.setLineDash([]);
    }
    c.fillStyle = bad ? "rgba(214,72,60,.14)" : "rgba(35,68,110,.08)";
    c.fillRect(-hw, -hl, s.w * S, s.l * S);
    c.strokeStyle = bad ? DANGER : s.flag ? "#C87F14" : INK;
    c.lineWidth = Math.max(1.4, 0.05 * S);
    if (s.flag && !bad) c.setLineDash([7, 4]);
    c.strokeRect(-hw, -hl, s.w * S, s.l * S);
    c.setLineDash([]);
    if (s.kind === "perp") {
      c.strokeStyle = bad ? DANGER : INK;
      c.lineWidth = Math.max(2, 0.07 * S);
      c.beginPath();
      c.moveTo(-hw * 0.72, -hl + 0.35 * S);
      c.lineTo(hw * 0.72, -hl + 0.35 * S);
      c.stroke();
    }
    if (s.tp === "pmr") {
      label(c, "♿", 0, hl - 0.55 * S, Math.max(10, 0.42 * S), "#2563EB", true);
    }
    /* car */
    const cw = (s.w - 0.5) * S;
    const cl = (s.l - 0.8) * S;
    const r = Math.min(cw * 0.3, 0.35 * S);
    c.fillStyle = "#5A6E88";
    c.beginPath();
    c.moveTo(-cw / 2 + r, -cl / 2);
    c.arcTo(cw / 2, -cl / 2, cw / 2, cl / 2, r * 1.6);
    c.arcTo(cw / 2, cl / 2, -cw / 2, cl / 2, r);
    c.arcTo(-cw / 2, cl / 2, -cw / 2, -cl / 2, r);
    c.arcTo(-cw / 2, -cl / 2, cw / 2, -cl / 2, r * 1.6);
    c.closePath();
    c.fill();
    c.fillStyle = "rgba(246,247,244,.85)";
    c.fillRect(-cw * 0.36, -cl * 0.24, cw * 0.72, cl * 0.14);
    c.fillRect(-cw * 0.36, cl * 0.16, cw * 0.72, cl * 0.12);
    c.restore();

    /* apron hint (clearances layer): manoeuvring space constrained */
    if (opts.clear && soft && !bad) {
      const apron = s.kind === "para" ? sideAprons(s, RULES.aislePara)[0] : entryApron(s, RULES.aislePerp);
      const cs = cornersOf(apron).map((p) => ({ x: X(p.x), y: Y(p.y) }));
      c.strokeStyle = "rgba(214,120,40,.75)";
      c.lineWidth = 1.6;
      c.setLineDash([5, 5]);
      c.beginPath();
      c.moveTo(cs[0].x, cs[0].y);
      for (let i = 1; i < 4; i++) c.lineTo(cs[i].x, cs[i].y);
      c.closePath();
      c.stroke();
      c.setLineDash([]);
    }

    /* number + labels */
    const fs = Math.max(9, Math.min(16, 0.36 * S));
    const num = numOf.get(s.id) || "";
    c.beginPath();
    c.arc(X(s.cx), Y(s.cy), fs * 0.85, 0, 7);
    c.fillStyle = bad ? DANGER : s.flag ? ACCENT : PAPER;
    c.fill();
    c.strokeStyle = bad ? DANGER : INK;
    c.lineWidth = 1.2;
    c.stroke();
    label(c, num, X(s.cx), Y(s.cy) + 0.5, fs * 0.86, bad || s.flag ? "#fff" : INK, true);
    if (opts.sdims)
      label(
        c,
        `${fmtM(s.w, lang)}×${fmtM(s.l, lang)}`,
        X(s.cx),
        Y(s.cy) + fs * 1.55,
        Math.max(7, 0.2 * S),
        "#43608C"
      );
    if (s.apts && s.apts.length)
      label(
        c,
        s.apts.map((a) => "A" + a).join("·"),
        X(s.cx),
        Y(s.cy) + fs * (opts.sdims ? 2.5 : 1.55),
        Math.max(7, 0.21 * S),
        "#2F7D57",
        true
      );
    if (sel && !sel.isStruct && sel.id === s.id) {
      const cs = cornersOf(s).map((p) => ({ x: X(p.x), y: Y(p.y) }));
      c.strokeStyle = ACCENT;
      c.lineWidth = 2.4;
      c.setLineDash([6, 4]);
      c.beginPath();
      c.moveTo(cs[0].x, cs[0].y);
      for (let i = 1; i < 4; i++) c.lineTo(cs[i].x, cs[i].y);
      c.closePath();
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = ACCENT;
      for (const p of cs) {
        c.beginPath();
        c.arc(p.x, p.y, 4.5, 0, 7);
        c.fill();
      }
    }
  }

  /* survey dims */
  if (opts.dims) {
    dim(c, fmtM(GH, lang), X(0), Y(0), X(0), Y(GH), 0.9, S);
    dim(c, fmtM(GW, lang), X(0), Y(GH), X(GW), Y(GH), 0.9, S);
    const tw = byId(doc.structure, "tw");
    if (tw) dim(c, fmtM(tw.w, lang), X(tw.x), Y(tw.y), X(tw.x + tw.w), Y(tw.y), 0.5, S);
    const cT1 = byId(doc.structure, "cT1");
    const cT2 = byId(doc.structure, "cT2");
    if (cT1 && cT2)
      dim(c, fmtM(cT2.x - (cT1.x + cT1.w), lang), X(cT1.x + cT1.w), Y(cT1.y), X(cT2.x), Y(cT2.y), 0.5, S);
    const coreA = byId(doc.structure, "coreA");
    if (coreA) {
      dim(c, fmtM(coreA.w, lang), X(coreA.x), Y(coreA.y), X(coreA.x + coreA.w), Y(coreA.y), 0.45, S);
      const midY = coreA.y + coreA.h * 0.475;
      dim(c, fmtM(GW - (coreA.x + coreA.w), lang), X(coreA.x + coreA.w), Y(midY), X(GW), Y(midY), 0, S);
    }
    const wing = byId(doc.structure, "wing");
    const c1 = byId(doc.structure, "c1");
    if (wing && c1 && c1.y > wing.y + wing.h)
      dim(c, fmtM(c1.y - (wing.y + wing.h), lang), X(wing.x - 1.2), Y(wing.y + wing.h), X(wing.x - 1.2), Y(c1.y), 0, S);
    const c3 = byId(doc.structure, "c3");
    if (c3 && GH > c3.y + c3.h)
      dim(c, fmtM(GH - (c3.y + c3.h), lang), X(GW), Y(c3.y + c3.h), X(GW), Y(GH), -0.55, S);
  }

  /* measure */
  if (measure && measure.a) {
    const A = measure.a;
    const B = measure.b || measure.a;
    c.strokeStyle = "#C87F14";
    c.fillStyle = "#C87F14";
    c.lineWidth = 2;
    c.setLineDash([6, 4]);
    c.beginPath();
    c.moveTo(X(A.x), Y(A.y));
    c.lineTo(X(B.x), Y(B.y));
    c.stroke();
    c.setLineDash([]);
    for (const p of [A, B]) {
      c.beginPath();
      c.arc(X(p.x), Y(p.y), 4, 0, 7);
      c.fill();
    }
    if (measure.b) {
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      label(c, fmtM(d, lang) + " m", X((A.x + B.x) / 2), Y((A.y + B.y) / 2) - 12, 13, "#C87F14", true);
    }
  }

  /* scale bar */
  const bx = X(0.3);
  const by = Y(GH) + (printMode ? 40 : 26);
  c.strokeStyle = INK;
  c.fillStyle = INK;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(bx, by);
  c.lineTo(bx + 5 * S, by);
  c.stroke();
  for (let i = 0; i <= 5; i++) {
    c.beginPath();
    c.moveTo(bx + i * S, by - 4);
    c.lineTo(bx + i * S, by + 4);
    c.stroke();
  }
  label(c, "0", bx, by + 12, 10, INK);
  label(c, "5 m", bx + 5 * S, by + 12, 10, INK);
}
