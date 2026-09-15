import type { Signature } from "@/lib/engine";

export function SignatureThumbnail({
  signature,
  className,
  strokeWidth = 2,
}: {
  signature: Signature;
  className?: string;
  strokeWidth?: number;
}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of signature.strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return <svg className={className} viewBox="0 0 1 1" />;
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const pad = Math.max(w, h) * 0.08;
  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${w + 2 * pad} ${h + 2 * pad}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {signature.strokes.map((s, i) => (
        <polyline
          key={i}
          points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
