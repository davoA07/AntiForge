/** Render ROC curves as a standalone SVG for the README. */

export interface RocSeries {
  label: string;
  color: string;
  dashed?: boolean;
  /** [FAR, TAR] pairs, FAR ascending. */
  points: [number, number][];
}

export function renderRocSvg(series: RocSeries[], title: string): string {
  const width = 640;
  const height = 480;
  const margin = { top: 48, right: 24, bottom: 56, left: 64 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const sx = (v: number) => margin.left + v * plotW;
  const sy = (v: number) => margin.top + (1 - v) * plotH;

  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const grid = ticks
    .map(
      (t) =>
        `<line x1="${sx(t)}" y1="${margin.top}" x2="${sx(t)}" y2="${margin.top + plotH}" class="grid"/>` +
        `<line x1="${margin.left}" y1="${sy(t)}" x2="${margin.left + plotW}" y2="${sy(t)}" class="grid"/>`,
    )
    .join("");
  const xLabels = ticks
    .map(
      (t) =>
        `<text x="${sx(t)}" y="${margin.top + plotH + 20}" text-anchor="middle" class="tick">${t.toFixed(1)}</text>`,
    )
    .join("");
  const yLabels = ticks
    .map(
      (t) =>
        `<text x="${margin.left - 10}" y="${sy(t) + 4}" text-anchor="end" class="tick">${t.toFixed(1)}</text>`,
    )
    .join("");

  const paths = series
    .map((s) => {
      const d = s.points
        .map(
          ([far, tar], i) =>
            `${i === 0 ? "M" : "L"}${sx(far).toFixed(1)},${sy(tar).toFixed(1)}`,
        )
        .join(" ");
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25"${s.dashed ? ' stroke-dasharray="6 4"' : ""} stroke-linejoin="round"/>`;
    })
    .join("");

  const legend = series
    .map((s, i) => {
      const y = margin.top + plotH - 16 - (series.length - 1 - i) * 20;
      const x = margin.left + plotW - 250;
      return (
        `<line x1="${x}" y1="${y}" x2="${x + 28}" y2="${y}" stroke="${s.color}" stroke-width="2.25"${s.dashed ? ' stroke-dasharray="6 4"' : ""}/>` +
        `<text x="${x + 36}" y="${y + 4}" class="legend">${escapeXml(s.label)}</text>`
      );
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">
  <style>
    text { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; fill: #333; }
    .title { font-size: 16px; font-weight: 600; }
    .axis { font-size: 13px; }
    .tick { font-size: 11px; fill: #666; }
    .legend { font-size: 12px; }
    .grid { stroke: #ddd; stroke-width: 1; }
    .frame { fill: none; stroke: #999; stroke-width: 1; }
    .diag { stroke: #bbb; stroke-width: 1; stroke-dasharray: 3 3; }
  </style>
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="${width / 2}" y="28" text-anchor="middle" class="title">${escapeXml(title)}</text>
  ${grid}
  <line x1="${sx(0)}" y1="${sy(0)}" x2="${sx(1)}" y2="${sy(1)}" class="diag"/>
  <rect x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" class="frame"/>
  ${xLabels}${yLabels}
  <text x="${margin.left + plotW / 2}" y="${height - 14}" text-anchor="middle" class="axis">False accept rate</text>
  <text transform="translate(18,${margin.top + plotH / 2}) rotate(-90)" text-anchor="middle" class="axis">True accept rate</text>
  ${paths}
  ${legend}
</svg>
`;
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&"]/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] as string,
  );
}
