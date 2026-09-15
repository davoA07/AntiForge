"use client";

import { Eraser, Smartphone, Undo2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import type { PointerKind, RawPoint, RawStroke, Signature } from "@/lib/engine";

export interface SignaturePadHandle {
  clear: () => void;
}

export interface SignaturePadProps {
  /** Fires after every completed stroke, undo and clear. `null` when empty. */
  onChange?: (signature: Signature | null) => void;
  /** A faint signature drawn underneath, for trying to trace it. */
  ghost?: Signature | null;
  disabled?: boolean;
  height?: number;
  /** Text shown while the surface is empty. */
  placeholder?: string;
  ref?: Ref<SignaturePadHandle>;
}

/**
 * Pointer-event capture surface. Records every sample the browser delivers
 * (including coalesced ones) with its high-resolution timestamp, pressure
 * and pointer type. Rendering is incremental: each new segment is drawn as
 * it arrives, and the canvas is only rebuilt from the stroke list on undo,
 * clear, resize or ghost change.
 */
export function SignaturePad({
  onChange,
  ghost = null,
  disabled = false,
  height = 260,
  placeholder = "Sign here",
  ref,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<RawStroke[]>([]);
  const currentRef = useRef<RawPoint[] | null>(null);
  const pointerTypeRef = useRef<PointerKind>("unknown");
  const activePointerRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 0, height });
  const [strokeCount, setStrokeCount] = useState(0);
  const [pointerKind, setPointerKind] = useState<PointerKind>("unknown");

  const emit = useCallback(() => {
    const strokes = strokesRef.current;
    setStrokeCount(strokes.length);
    if (!onChange) return;
    if (strokes.length === 0) {
      onChange(null);
      return;
    }
    onChange({
      strokes: strokes.map((s) => ({ points: s.points.map((p) => ({ ...p })) })),
      capturedAt: Date.now(),
      pointerType: pointerTypeRef.current,
      hasPressure: pointerTypeRef.current === "pen",
      surface: { ...sizeRef.current },
    });
  }, [onChange]);

  const drawSegment = useCallback(
    (ctx: CanvasRenderingContext2D, a: RawPoint, b: RawPoint, pen: boolean) => {
      ctx.lineWidth = pen ? 1 + 2.6 * (b.p ?? 0.5) : 2.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    },
    [],
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, height: h } = sizeRef.current;
    ctx.clearRect(0, 0, width, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (ghost) {
      ctx.save();
      ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--accent") || "#888";
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 2;
      const fit = fitGhost(ghost, width, h);
      for (const stroke of ghost.strokes) {
        ctx.beginPath();
        stroke.points.forEach((p, i) => {
          const x = fit.ox + (p.x - fit.minX) * fit.scale;
          const y = fit.oy + (p.y - fit.minY) * fit.scale;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--ink") || "#111";
    const pen = pointerTypeRef.current === "pen";
    for (const stroke of strokesRef.current) {
      for (let i = 1; i < stroke.points.length; i++) {
        drawSegment(ctx, stroke.points[i - 1], stroke.points[i], pen);
      }
    }
  }, [ghost, drawSegment]);

  // Size the backing store to the element and device pixel ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    redraw();
  }, [ghost, redraw]);

  // Re-render strokes if the colour scheme flips while a signature is on screen.
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => redraw();
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [redraw]);

  const clear = useCallback(() => {
    strokesRef.current = [];
    currentRef.current = null;
    redraw();
    emit();
  }, [redraw, emit]);

  const undo = useCallback(() => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    redraw();
    emit();
  }, [redraw, emit]);

  useImperativeHandle(ref, () => ({ clear }), [clear]);

  const toPoint = (ev: PointerEvent, rect: DOMRect): RawPoint => ({
    x: ev.clientX - rect.left,
    y: ev.clientY - rect.top,
    t: ev.timeStamp,
    p: ev.pressure,
  });

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (disabled || activePointerRef.current !== null) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const canvas = e.currentTarget;
    canvas.setPointerCapture(e.pointerId);
    activePointerRef.current = e.pointerId;
    const kind = e.pointerType as PointerKind;
    if (strokesRef.current.length === 0) {
      pointerTypeRef.current = kind;
      setPointerKind(kind);
    }
    const rect = canvas.getBoundingClientRect();
    currentRef.current = [toPoint(e.nativeEvent, rect)];
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("--ink") || "#111";
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = currentRef.current;
    if (!current || e.pointerId !== activePointerRef.current) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    const native = e.nativeEvent;
    const events =
      typeof native.getCoalescedEvents === "function" && native.getCoalescedEvents().length > 0
        ? native.getCoalescedEvents()
        : [native];
    const pen = pointerTypeRef.current === "pen";
    for (const ev of events) {
      const point = toPoint(ev, rect);
      const last = current[current.length - 1];
      if (point.t < last.t) point.t = last.t;
      current.push(point);
      if (ctx) drawSegment(ctx, last, point, pen);
    }
  };

  const finishStroke = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = currentRef.current;
    if (!current || e.pointerId !== activePointerRef.current) return;
    activePointerRef.current = null;
    currentRef.current = null;
    if (current.length === 1) {
      // A tap: keep it as a dot so i-dots and full stops count as strokes.
      const p = current[0];
      current.push({ ...p, x: p.x + 0.01, t: Math.max(p.t + 1, e.nativeEvent.timeStamp) });
      const ctx = e.currentTarget.getContext("2d");
      if (ctx) drawSegment(ctx, current[0], current[1], pointerTypeRef.current === "pen");
    }
    strokesRef.current = [...strokesRef.current, { points: current }];
    emit();
  };

  const empty = strokeCount === 0;

  return (
    <div className="space-y-2">
      <div
        className={`paper-grid relative overflow-hidden rounded-xl border bg-paper-2/60 ${
          disabled ? "border-line opacity-60" : "border-line"
        }`}
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          className={`block h-full w-full ${disabled ? "cursor-not-allowed" : "cursor-crosshair"}`}
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onLostPointerCapture={finishStroke}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Signature capture surface"
          role="img"
        />
        {empty && !disabled && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-8">
            <span className="font-display text-2xl text-ink-3/70">{placeholder}</span>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-8 bottom-6 border-b border-dashed border-ink-3/30" />
      </div>
      <div className="flex items-center justify-between text-xs text-ink-3">
        <span className="tabular">
          {empty ? "No strokes yet" : `${strokeCount} stroke${strokeCount === 1 ? "" : "s"}`}
          {!empty && pointerKind !== "unknown" && ` · ${pointerKind}`}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={empty || disabled}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-paper-2 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={empty || disabled}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-paper-2 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Eraser className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </div>
      <p className="rotate-hint items-center gap-1.5 text-xs text-ink-3">
        <Smartphone className="h-3.5 w-3.5 rotate-90" aria-hidden="true" />
        Turn your phone sideways for more room to sign.
      </p>
    </div>
  );
}

function fitGhost(sig: Signature, width: number, height: number) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of sig.strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const scale = Math.min((width * 0.8) / w, (height * 0.7) / h);
  return {
    minX,
    minY,
    scale,
    ox: (width - w * scale) / 2,
    oy: (height - h * scale) / 2,
  };
}
