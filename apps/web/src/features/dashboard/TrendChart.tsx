import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import type { DashboardTrendPoint } from '@nexus/shared';

/**
 * Categorical slots 1–2 of the validated data-viz palette (light mode, checked with
 * validate_palette.js: CVD ΔE 24.7, normal-vision ΔE 33.6, both ≥ 3:1 on white).
 * Fixed order: "Selesai" is always slot 1, "Dibuat" slot 2.
 */
const SERIES = [
  { key: 'completed', label: 'Selesai', color: '#2a78d6' },
  { key: 'created', label: 'Dibuat', color: '#eb6834' },
] as const;

const HEIGHT = 232;
const M = { top: 12, right: 8, bottom: 28, left: 34 };

function niceScale(max: number): { top: number; step: number } {
  if (max <= 4) return { top: 4, step: 1 };
  const rough = max / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { top: Math.ceil(max / step) * step, step };
}

/** Bar with 4px rounded data-end, square on the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const dayLabel = (date: string, isLast: boolean) => (isLast ? 'Hari ini' : format(parseISO(date), 'd MMM', { locale: id }));

/** Cards created vs completed per day over the last 14 days. */
export function TrendChart({ points }: { points: DashboardTrendPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totals = useMemo(
    () => ({
      completed: points.reduce((s, p) => s + p.completed, 0),
      created: points.reduce((s, p) => s + p.created, 0),
    }),
    [points],
  );
  const max = Math.max(0, ...points.flatMap((p) => [p.completed, p.created]));
  const { top, step } = niceScale(max);
  const empty = max === 0;

  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const band = innerW / points.length;
  const barW = Math.max(3, Math.min(14, (band - 8) / 2));
  const y = (v: number) => M.top + innerH - (v / top) * innerH;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  // Label every other day, anchored on today so the latest bar is always named.
  const labelEvery = band < 34 ? 2 : 1;

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setActive((i) => {
      const cur = i ?? points.length - 1;
      return Math.min(points.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    });
  };

  const activePoint = active !== null ? points[active] : null;
  const tooltipLeft = active !== null ? M.left + band * active + band / 2 : 0;

  return (
    // `relative` contains the absolutely positioned sr-only table and tooltip.
    <div className="relative">
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2 text-[0.8125rem] text-ink-muted">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: s.color }} aria-hidden />
            {s.label}
            <span className="font-bold tabular-nums text-ink">{totals[s.key]}</span>
          </span>
        ))}
        <span className="ml-auto text-caption text-ink-subtle">14 hari terakhir</span>
      </div>

      <div
        ref={wrapRef}
        className="relative outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-brand"
        tabIndex={0}
        role="img"
        aria-label={`Grafik 14 hari: ${totals.completed} kartu selesai, ${totals.created} kartu dibuat. Gunakan panah kiri/kanan untuk melihat per hari.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} className="block" aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'stroke-line-strong' : 'stroke-line-subtle'} strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-subtle text-[11px] tabular-nums">
                {t}
              </text>
            </g>
          ))}

          {activePoint && (
            <rect x={M.left + band * active!} y={M.top} width={band} height={innerH} rx={6} className="fill-ink/[0.04]" />
          )}

          {points.map((p, i) => {
            const cx = M.left + band * i + band / 2;
            const isLast = i === points.length - 1;
            const showLabel = (points.length - 1 - i) % labelEvery === 0;
            return (
              <g key={p.date}>
                {SERIES.map((s, si) => {
                  const v = p[s.key];
                  if (v === 0) return null;
                  const x = si === 0 ? cx - barW - 1 : cx + 1; // 2px gap between the pair
                  return <path key={s.key} d={barPath(x, y(v), barW, y(0) - y(v))} fill={s.color} />;
                })}
                {showLabel && (
                  <text
                    x={cx}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                    className={isLast ? 'fill-ink text-[11px] font-semibold' : 'fill-ink-subtle text-[11px]'}
                  >
                    {dayLabel(p.date, isLast)}
                  </text>
                )}
                {/* Hit target: the whole day column, bigger than the bars. */}
                <rect x={M.left + band * i} y={M.top} width={band} height={innerH + M.bottom} fill="transparent" onPointerEnter={() => setActive(i)} />
              </g>
            );
          })}
        </svg>

        {empty && (
          <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[0.8125rem] text-ink-subtle">
            Belum ada kartu dibuat atau diselesaikan dalam 14 hari terakhir.
          </p>
        )}

        {activePoint && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-[140px] -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 shadow-card-hover"
            style={{ left: Math.min(Math.max(tooltipLeft, 80), width - 80) }}
          >
            <p className="mb-1 text-caption font-semibold text-ink-muted">
              {format(parseISO(activePoint.date), 'EEEE, d MMM', { locale: id })}
            </p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-2 text-[0.8125rem]">
                <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: s.color }} aria-hidden />
                <span className="font-bold tabular-nums text-ink">{activePoint[s.key]}</span>
                <span className="text-ink-muted">{s.label.toLowerCase()}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Table view for screen readers. */}
      <table className="sr-only">
        <caption>Kartu dibuat dan selesai per hari</caption>
        <thead>
          <tr>
            <th scope="col">Tanggal</th>
            <th scope="col">Selesai</th>
            <th scope="col">Dibuat</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <th scope="row">{format(parseISO(p.date), 'd MMMM yyyy', { locale: id })}</th>
              <td>{p.completed}</td>
              <td>{p.created}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
