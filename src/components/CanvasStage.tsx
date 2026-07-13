"use client";

/* Interactive plan canvas: pan / pinch-zoom / wheel-zoom, stall & structure
   dragging with 5 cm snap, measure tool, floating action pill. */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Doc, Lang } from "@/lib/model";
import { pointInOBB, snapTo, type Pt } from "@/lib/geom";
import { drawScene, type LayerOpts, type Measure, type Selection, type View } from "@/lib/render";
import type { WarningMap } from "@/lib/warnings";

export interface StageHandle {
  fit: () => void;
  zoomBy: (k: number) => void;
  centerWorld: () => Pt;
  redraw: () => void;
}

interface StageProps {
  doc: Doc;
  warn: WarningMap;
  opts: LayerOpts;
  lang: Lang;
  sel: Selection | null;
  tool: "sel" | "measure";
  pill: ReactNode | null;
  onSelect: (sel: Selection | null) => void;
  onLiveEdit: (fn: (d: Doc) => Doc) => void;
  onCommitEdit: (isStruct: boolean) => void;
  onDoubleTapStall: () => void;
}

interface DragState {
  id: string;
  isStruct: boolean;
  gx: number;
  gy: number;
}

export const CanvasStage = forwardRef<StageHandle, StageProps>(function CanvasStage(props, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ S: 24, ox: 20, oy: 40 });
  const propsRef = useRef(props);
  propsRef.current = props;

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<DragState | null>(null);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinch0 = useRef<{ d: number; mx: number; my: number; S: number; ox: number; oy: number } | null>(null);
  const moved = useRef(false);
  const measure = useRef<Measure | null>(null);

  const [pillAnchor, setPillAnchor] = useState<{ x: number; y: number } | null>(null);

  const dpr = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 3);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const p = propsRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width / dpr, cv.height / dpr);
    ctx.fillStyle = "#F6F7F4";
    ctx.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
    drawScene(ctx, view.current, p.doc, p.warn, p.opts, p.lang, p.sel, measure.current, false);

    // pill anchor
    if (p.sel) {
      const o = p.sel.isStruct
        ? p.doc.structure.find((s) => s.id === p.sel!.id)
        : p.doc.stalls.find((s) => s.id === p.sel!.id);
      if (o) {
        const cx = p.sel.isStruct
          ? (o as { x: number; w: number }).x + (o as { w: number }).w / 2
          : (o as { cx: number }).cx;
        const cyTop = p.sel.isStruct
          ? (o as { y: number }).y
          : (o as { cy: number; l: number }).cy - (o as { l: number }).l / 2;
        const px = view.current.ox + cx * view.current.S;
        const py = view.current.oy + cyTop * view.current.S - 56;
        setPillAnchor((prev) =>
          prev && Math.abs(prev.x - px) < 0.5 && Math.abs(prev.y - py) < 0.5 ? prev : { x: px, y: py }
        );
      } else setPillAnchor(null);
    } else setPillAnchor(null);
  }, [dpr]);

  const sizeCanvas = useCallback(() => {
    const cv = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cv || !wrap) return;
    const r = wrap.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    cv.style.width = r.width + "px";
    cv.style.height = r.height + "px";
    draw();
  }, [dpr, draw]);
  const sizeCanvasRef = useRef<(() => void) | null>(null);
  sizeCanvasRef.current = sizeCanvas;

  const fitTries = useRef(0);
  const fit = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (r.width < 80 || r.height < 80) {
      // layout not settled yet — retry a few frames later
      if (fitTries.current < 20) {
        fitTries.current += 1;
        requestAnimationFrame(() => {
          sizeCanvasRef.current?.();
          fitRef.current?.();
        });
      }
      return;
    }
    fitTries.current = 0;
    const { W, H } = propsRef.current.doc.garage;
    const topPad = 22;
    const botPad = 92;
    const side = 30;
    const S = Math.max(4, Math.min((r.width - side * 2) / W, (r.height - topPad - botPad) / H));
    view.current.S = S;
    view.current.ox = (r.width - W * S) / 2;
    view.current.oy = topPad + (r.height - topPad - botPad - H * S) / 2;
    draw();
  }, [draw]);
  const fitRef = useRef<(() => void) | null>(null);
  fitRef.current = fit;

  useImperativeHandle(
    ref,
    () => ({
      fit,
      zoomBy: (k: number) => {
        const cv = canvasRef.current;
        if (!cv) return;
        const r = cv.getBoundingClientRect();
        const S2 = Math.max(7, Math.min(220, view.current.S * k));
        const wx = (r.width / 2 - view.current.ox) / view.current.S;
        const wy = (r.height / 2 - view.current.oy) / view.current.S;
        view.current.ox = r.width / 2 - wx * S2;
        view.current.oy = r.height / 2 - wy * S2;
        view.current.S = S2;
        draw();
      },
      centerWorld: () => {
        const cv = canvasRef.current;
        if (!cv) return { x: 2, y: 2 };
        const r = cv.getBoundingClientRect();
        return {
          x: (r.width / 2 - view.current.ox) / view.current.S,
          y: (r.height / 2 - view.current.oy) / view.current.S,
        };
      },
      redraw: draw,
    }),
    [draw, fit]
  );

  /* mount: size + fit + resize observer (refit on resize, like v2) */
  useEffect(() => {
    sizeCanvas();
    fit();
    const wrap = wrapRef.current;
    if (!wrap) return;
    let last = { w: wrap.clientWidth, h: wrap.clientHeight };
    const ro = new ResizeObserver(() => {
      sizeCanvas();
      const now = { w: wrap.clientWidth, h: wrap.clientHeight };
      if (Math.abs(now.w - last.w) > 2 || Math.abs(now.h - last.h) > 2) {
        last = now;
        fitRef.current?.();
      }
    });
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* refit when the garage envelope changes */
  const { W, H } = props.doc.garage;
  useEffect(() => {
    fit();
  }, [W, H, fit]);

  /* redraw after every commit/render */
  useEffect(() => {
    draw();
  });

  /* clear measure when leaving the tool */
  useEffect(() => {
    if (props.tool !== "measure") {
      measure.current = null;
      draw();
    }
  }, [props.tool, draw]);

  /* non-passive wheel zoom */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const k = e.deltaY < 0 ? 1.12 : 0.9;
      const S2 = Math.max(7, Math.min(220, view.current.S * k));
      const wx = (e.clientX - r.left - view.current.ox) / view.current.S;
      const wy = (e.clientY - r.top - view.current.oy) / view.current.S;
      view.current.ox = e.clientX - r.left - wx * S2;
      view.current.oy = e.clientY - r.top - wy * S2;
      view.current.S = S2;
      draw();
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [draw]);

  const evtWorld = (e: { clientX: number; clientY: number }): Pt => {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.current.ox) / view.current.S,
      y: (e.clientY - r.top - view.current.oy) / view.current.S,
    };
  };

  const snapV = (v: number) => (propsRef.current.opts.snap ? snapTo(v, 0.05) : v);

  const hitTest = (p: Pt): Selection | null => {
    const d = propsRef.current.doc;
    for (let i = d.stalls.length - 1; i >= 0; i--) {
      if (pointInOBB(p, d.stalls[i])) return { id: d.stalls[i].id, isStruct: false };
    }
    if (propsRef.current.opts.struct) {
      for (let i = d.structure.length - 1; i >= 0; i--) {
        const st = d.structure[i];
        if (p.x >= st.x && p.x <= st.x + st.w && p.y >= st.y && p.y <= st.y + st.h)
          return { id: st.id, isStruct: true };
      }
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current!;
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const ps = [...pointers.current.values()];
      pinch0.current = {
        d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y),
        mx: (ps[0].x + ps[1].x) / 2,
        my: (ps[0].y + ps[1].y) / 2,
        S: view.current.S,
        ox: view.current.ox,
        oy: view.current.oy,
      };
      drag.current = null;
      panStart.current = null;
      return;
    }
    const p = evtWorld(e);
    if (propsRef.current.tool === "measure") {
      const m = measure.current;
      if (!m || m.b) measure.current = { a: { x: snapV(p.x), y: snapV(p.y) }, b: null };
      else m.b = { x: snapV(p.x), y: snapV(p.y) };
      draw();
      return;
    }
    const h = hitTest(p);
    if (h) {
      const d = propsRef.current.doc;
      const o = h.isStruct ? d.structure.find((s) => s.id === h.id)! : d.stalls.find((s) => s.id === h.id)!;
      drag.current = {
        id: h.id,
        isStruct: h.isStruct,
        gx: p.x - (h.isStruct ? (o as { x: number }).x : (o as { cx: number }).cx),
        gy: p.y - (h.isStruct ? (o as { y: number }).y : (o as { cy: number }).cy),
      };
    } else {
      panStart.current = { x: e.clientX, y: e.clientY, ox: view.current.ox, oy: view.current.oy };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch0.current) {
      const cv = canvasRef.current!;
      const ps = [...pointers.current.values()];
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const mx = (ps[0].x + ps[1].x) / 2;
      const my = (ps[0].y + ps[1].y) / 2;
      const k = Math.max(0.25, Math.min(6, d / pinch0.current.d));
      const S2 = Math.max(7, Math.min(220, pinch0.current.S * k));
      const r = cv.getBoundingClientRect();
      const wx = (pinch0.current.mx - r.left - pinch0.current.ox) / pinch0.current.S;
      const wy = (pinch0.current.my - r.top - pinch0.current.oy) / pinch0.current.S;
      view.current.S = S2;
      view.current.ox = mx - r.left - wx * S2;
      view.current.oy = my - r.top - wy * S2;
      draw();
      return;
    }
    const p = evtWorld(e);
    if (drag.current) {
      moved.current = true;
      const dr = drag.current;
      const nx = snapV(p.x - dr.gx);
      const ny = snapV(p.y - dr.gy);
      propsRef.current.onLiveEdit((d) => {
        if (dr.isStruct) {
          return {
            ...d,
            structure: d.structure.map((s) => (s.id === dr.id ? { ...s, x: nx, y: ny } : s)),
          };
        }
        return {
          ...d,
          stalls: d.stalls.map((s) => (s.id === dr.id ? { ...s, cx: nx, cy: ny } : s)),
        };
      });
    } else if (panStart.current) {
      moved.current = true;
      view.current.ox = panStart.current.ox + (e.clientX - panStart.current.x);
      view.current.oy = panStart.current.oy + (e.clientY - panStart.current.y);
      draw();
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch0.current = null;
    if (drag.current) {
      const dr = drag.current;
      propsRef.current.onSelect({ id: dr.id, isStruct: dr.isStruct });
      if (moved.current) propsRef.current.onCommitEdit(dr.isStruct);
      drag.current = null;
    } else if (panStart.current) {
      if (!moved.current && propsRef.current.tool === "sel") propsRef.current.onSelect(null);
      panStart.current = null;
    }
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-crosshair touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDoubleClick={() => {
          const s = propsRef.current.sel;
          if (s && !s.isStruct) propsRef.current.onDoubleTapStall();
        }}
      />
      {props.pill && pillAnchor && (
        <div
          className="absolute z-20 -translate-x-1/2"
          style={{
            left: Math.max(140, Math.min((wrapRef.current?.clientWidth || 400) - 140, pillAnchor.x)),
            top: Math.max(8, pillAnchor.y),
          }}
        >
          {props.pill}
        </div>
      )}
    </div>
  );
});
