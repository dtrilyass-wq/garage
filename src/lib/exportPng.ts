/* High-resolution PNG export: title block + plan + marking table. */

import type { Doc, Lang } from "./model";
import { cornersOf } from "./geom";
import { fmtM, tr } from "./i18n";
import { drawScene, stallOrder, MONO, type LayerOpts } from "./render";
import type { WarningMap } from "./warnings";

export function exportPNG(doc: Doc, warn: WarningMap, opts: LayerOpts, lang: Lang): void {
  const t = tr(lang);
  const px = 2200;
  const headH = 150;
  const pad = 60;
  const ord = stallOrder(doc.stalls);
  const rowH = 44;
  const tblH = rowH * (ord.length + 2) + 70;
  const S = (px - pad * 2) / doc.garage.W;
  const planH = doc.garage.H * S + pad * 2;
  const oc = document.createElement("canvas");
  oc.width = px;
  oc.height = Math.round(headH + planH + tblH);
  const c = oc.getContext("2d");
  if (!c) return;
  c.fillStyle = "#F6F7F4";
  c.fillRect(0, 0, oc.width, oc.height);

  /* title block */
  c.fillStyle = "#141F2C";
  c.fillRect(0, 0, px, headH);
  c.fillStyle = "#F3A73B";
  c.fillRect(0, headH - 6, px, 6);
  c.fillStyle = "#EAF0F6";
  c.font = "700 42px " + MONO;
  c.fillText(t.planTitle, pad, 62);
  c.fillStyle = "#9FB0C2";
  c.font = "25px " + MONO;
  const d = new Date();
  const dims = `${fmtM(doc.garage.W, lang)} × ${fmtM(doc.garage.H, lang)} m`;
  c.fillText(
    `${t.planSub(dims)}   ·   🚗 ${doc.stalls.length}   ·   ${d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB")}`,
    pad,
    110
  );

  drawScene(c, { S, ox: pad, oy: headH + pad }, doc, warn, opts, lang, null, null, true);

  /* marking table */
  let ty = headH + planH + 30;
  c.fillStyle = "#23446E";
  c.font = "700 28px " + MONO;
  const cols = [pad, pad + 120, pad + 520, pad + 950, pad + 1200, pad + 1450];
  const heads = [t.thN, t.thT, t.thD, t.thX, t.thY, t.thA];
  heads.forEach((h, i) => c.fillText(h, cols[i], ty));
  ty += 14;
  c.strokeStyle = "#23446E";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(pad, ty);
  c.lineTo(px - pad, ty);
  c.stroke();
  c.font = "26px " + MONO;
  ord.forEach((s, i) => {
    ty += rowH;
    const csx = cornersOf(s);
    const minx = Math.min(...csx.map((p) => p.x));
    const miny = Math.min(...csx.map((p) => p.y));
    c.fillStyle = s.flag ? "#C87F14" : "#23446E";
    c.fillText(String(i + 1), cols[0], ty);
    c.fillText(t[s.tp] + (s.flag ? " ⚠" : ""), cols[1], ty);
    c.fillText(`${fmtM(s.w, lang)} × ${fmtM(s.l, lang)}`, cols[2], ty);
    c.fillText(fmtM(minx, lang), cols[3], ty);
    c.fillText(fmtM(miny, lang), cols[4], ty);
    c.fillStyle = "#2F7D57";
    c.fillText((s.apts || []).map((a) => t.aptShort + " " + a).join(" + ") || "—", cols[5], ty);
    c.strokeStyle = "#D5DDD4";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(pad, ty + 12);
    c.lineTo(px - pad, ty + 12);
    c.stroke();
  });
  ty += rowH;
  c.fillStyle = "#7288A8";
  c.font = "22px " + MONO;
  c.fillText(t.tblNote, pad, ty);

  const a = document.createElement("a");
  a.download = "plan-parking-garage.png";
  a.href = oc.toDataURL("image/png");
  a.click();
}
