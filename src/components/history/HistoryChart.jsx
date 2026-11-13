// ─────────────────────────────────────────────
//  HistoryChart.jsx  –  ONE line graph for ONE unit of measurement
//  (hand-drawn SVG, no chart library)
//
//  HistoryPage renders one of these per unit (bpm, cm, %, …), so a graph
//  never mixes units. Metrics that share a unit share the same y-axis.
//
//  • x-axis: time buckets (15 min / hour / day / month, chosen by the range)
//  • y-axis: one shared scale for every metric in this chart
//  • horizontal threshold zones: bands of the first metric
//  • legend: lines on the left, zones on the right
//  • hover / touch: guide line + tooltip with every metric's real value
//
//  Props:
//    points  – [{ t0, t1, values: {id: number|null} }]   (aggregate())
//    unit    – 'min15' | 'hour' | 'day' | 'month'        (x-axis bucket size)
//    metrics – METRICS entries that share ONE unit, in display order (≥ 1)
//    loading – boolean
// ─────────────────────────────────────────────

import { useMemo, useRef, useState } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import {
  domainFor,
  formatBucketLabel,
  formatBucketRange,
  formatValue,
  niceTicks,
  tickIndices,
} from '../../utils/history'

const PAD = { l: 56, r: 20, t: 28, b: 34 }   // top padding leaves room for the unit label

/** consecutive runs of non-null points: [[i, i+1, …], …] */
function segmentsOf(points, id) {
  const segs = []
  let cur = []
  points.forEach((p, i) => {
    if (p.values[id] == null) {
      if (cur.length) segs.push(cur)
      cur = []
    } else {
      cur.push(i)
    }
  })
  if (cur.length) segs.push(cur)
  return segs
}

export function HistoryChart({ points, unit, metrics, loading = false }) {
  const wrapRef = useRef(null)
  const { width, height } = useElementSize(wrapRef)
  const [hover, setHover] = useState(null)       // bucket index

  const primary = metrics[0]
  const axisUnit = primary.unit
  const n = points.length

  // One shared y-domain: the union of every metric's own domain (same unit ⇒ same scale).
  const [d0, d1] = useMemo(() => {
    const domains = metrics.map((m) => domainFor(m, points.map((p) => p.values[m.id])))
    return [Math.min(...domains.map((d) => d[0])), Math.max(...domains.map((d) => d[1]))]
  }, [metrics, points])

  const hasData = points.some((p) => metrics.some((m) => p.values[m.id] != null))

  const innerW = Math.max(0, width - PAD.l - PAD.r)
  const innerH = Math.max(0, height - PAD.t - PAD.b)
  const bandW = n ? innerW / n : innerW

  const xOf = (i) => PAD.l + (i + 0.5) * bandW
  const yOf = (v) => PAD.t + innerH - ((v - d0) / (d1 - d0 || 1)) * innerH

  const yTicks = niceTicks(d0, d1, 5)
  const xTicks = n ? tickIndices(unit, n, Math.floor(innerW / 84)) : []

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.floor((e.clientX - rect.left) / bandW)
    setHover(Math.min(n - 1, Math.max(0, i)))
  }

  const hp = hover != null ? points[hover] : null
  const tipFlip = hover != null && xOf(hover) > width * 0.6

  return (
    <div className="flex flex-col h-full">
      {/* ── Legend ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-1 pb-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {metrics.map((m) => (
            <li key={m.id} className="inline-flex items-center gap-2 text-label font-semibold">
              <span className="inline-block w-key-length h-stroke rounded-full" style={{ background: m.color }} />
              {m.label}
              <span className="font-normal text-ink-muted">({m.unit})</span>
            </li>
          ))}
        </ul>

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {primary.zones.map((z) => (
            <li key={z.label} className="inline-flex items-center gap-2 text-xs text-ink-soft">
              <span
                className="inline-block size-key-box rounded-chip border"
                style={{ background: `${z.color}2e`, borderColor: `${z.color}88` }}
              />
              {z.label}
            </li>
          ))}
        </ul>
      </div>

      {/* ── Plot ── */}
      <div ref={wrapRef} className="relative flex-1 min-h-0">
        {width > 0 && height > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Grafik ${metrics.map((m) => m.label).join(', ')} (${axisUnit})`}
            className="block select-none"
          >
            {/* threshold zones (first metric) */}
            {primary.zones.map((z) => {
              const lo = Math.max(z.from, d0)
              const hi = Math.min(z.to, d1)
              if (hi <= lo) return null
              const yTop = yOf(hi)
              const yBot = yOf(lo)
              return (
                <g key={z.label}>
                  <rect x={PAD.l} y={yTop} width={innerW} height={yBot - yTop} fill={z.color} opacity="0.13" />
                  {z.from > d0 && (
                    <line
                      x1={PAD.l} x2={PAD.l + innerW}
                      y1={yBot} y2={yBot}
                      stroke={z.color} strokeOpacity="0.55" strokeDasharray="5 4"
                    />
                  )}
                </g>
              )
            })}

            {/* y grid + labels */}
            {yTicks.map((v) => {
              const y = yOf(v)
              return (
                <g key={v}>
                  <line x1={PAD.l} x2={PAD.l + innerW} y1={y} y2={y} className="stroke-ink-ghost/70" />
                  <text x={PAD.l - 10} y={y} textAnchor="end" dominantBaseline="central" fontSize="12" className="fill-ink-muted">
                    {v}
                  </text>
                </g>
              )
            })}
            <text x={PAD.l - 10} y={PAD.t - 16} textAnchor="end" fontSize="11" fontWeight="700" className="fill-ink-soft">
              {axisUnit}
            </text>

            {/* x labels */}
            <line x1={PAD.l} x2={PAD.l + innerW} y1={PAD.t + innerH} y2={PAD.t + innerH} className="stroke-ink-faint" />
            {xTicks.map((i) => (
              <g key={i}>
                <line x1={xOf(i)} x2={xOf(i)} y1={PAD.t + innerH} y2={PAD.t + innerH + 5} className="stroke-ink-faint" />
                <text x={xOf(i)} y={PAD.t + innerH + 20} textAnchor="middle" fontSize="12" className="fill-ink-muted">
                  {formatBucketLabel(unit, points[i].t0)}
                </text>
              </g>
            ))}

            {/* series */}
            {[...metrics].reverse().map((m) => {
              const segs = segmentsOf(points, m.id)
              return (
                <g key={m.id}>
                  {segs.map((seg, si) =>
                    seg.length > 1 ? (
                      <path
                        key={si}
                        d={seg.map((i, k) => `${k ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(points[i].values[m.id]).toFixed(1)}`).join('')}
                        fill="none"
                        stroke={m.color}
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ) : null
                  )}
                  {segs.flatMap((seg) =>
                    // markers on sparse charts and on short runs, so a 2-point session is still visible
                    (n <= 48 || seg.length <= 4 ? seg : []).map((i) => (
                      <circle
                        key={i}
                        cx={xOf(i)}
                        cy={yOf(points[i].values[m.id])}
                        r={seg.length === 1 ? 4 : 3}
                        fill={m.color}
                        className="stroke-white"
                        strokeWidth="1.5"
                      />
                    ))
                  )}
                </g>
              )
            })}

            {/* hover guide */}
            {hp && (
              <g pointerEvents="none">
                <line x1={xOf(hover)} x2={xOf(hover)} y1={PAD.t} y2={PAD.t + innerH} className="stroke-ink/35" strokeDasharray="3 3" />
                {metrics.map((m) =>
                  hp.values[m.id] != null ? (
                    <circle key={m.id} cx={xOf(hover)} cy={yOf(hp.values[m.id])} r="5.5" className="fill-white" stroke={m.color} strokeWidth="3" />
                  ) : null
                )}
              </g>
            )}

            {/* pointer capture */}
            <rect
              x={PAD.l} y={PAD.t} width={innerW} height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}

        {/* tooltip */}
        {hp && (
          <div
            className="absolute z-sticky pointer-events-none rounded-xl bg-ink text-white shadow-xl px-3 py-2 text-xs min-w-tooltip"
            style={{
              top: PAD.t + 6,
              left: tipFlip ? xOf(hover) - 12 : xOf(hover) + 12,
              transform: tipFlip ? 'translateX(-100%)' : undefined,
            }}
          >
            <p className="font-bold mb-1.5 text-hairline">{formatBucketRange(unit, hp)}</p>
            {metrics.map((m) => (
              <p key={m.id} className="flex items-center justify-between gap-4 leading-relaxed">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-dot-sm rounded-full" style={{ background: m.color }} />
                  {m.label}
                </span>
                <span className="font-bold tabular-nums">
                  {hp.values[m.id] == null ? '—' : `${formatValue(hp.values[m.id], m.decimals)} ${m.unit}`}
                </span>
              </p>
            ))}
          </div>
        )}

        {/* empty / loading overlay */}
        {!hasData && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="rounded-2xl bg-white/90 border border-line px-5 py-3 text-center shadow-sm">
              <p className="text-sm font-bold">
                {loading ? 'Memuat data…' : 'Belum ada data pada rentang ini'}
              </p>
              {!loading && (
                <p className="mt-0.5 text-xs text-ink-muted">
                  Rekam sesi dari Beranda (BLE atau Simulasi), atau ganti periode.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
