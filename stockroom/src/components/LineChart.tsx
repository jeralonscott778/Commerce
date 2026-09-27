import { useEffect, useRef, useState } from 'react'

export interface Series { name: string; color: string; values: number[]; dashed?: boolean }

function smooth(pts: [number, number][], bottom = Infinity) {
  const cl = (v: number) => Math.min(v, bottom)
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    const t = 0.18
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, cl(p1[1] + (p2[1] - p0[1]) * t)]
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, cl(p2[1] - (p3[1] - p1[1]) * t)]
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}
function niceMax(v: number) {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10) * p
}

export default function LineChart({ labels, series, format, height = 240, tooltip }: {
  labels: string[]; series: Series[]; format: (v: number) => string; height?: number
  tooltip: (i: number) => { title: string; lines: string[] }
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(600)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ro = new ResizeObserver(e => setW(Math.max(260, e[0].contentRect.width)))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const L = 52, R = 8, T = 12, B = 28
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)))
  const n = labels.length
  const x = (i: number) => L + (n <= 1 ? 0 : (i * (w - L - R)) / (n - 1))
  const y = (v: number) => T + (height - T - B) * (1 - v / max)
  const ticks = [0, max / 2, max]
  const every = Math.max(1, Math.ceil(n / Math.floor((w - L) / 70)))
  const tip = hover != null ? tooltip(hover) : null

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const i = Math.round(((px - L) / (w - L - R)) * (n - 1))
    setHover(i >= 0 && i < n ? i : null)
  }

  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg viewBox={`0 0 ${w} ${height}`} width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Sales over time">
        {ticks.map(t => <g key={t}><line className="grid" x1={L} x2={w - R} y1={y(t)} y2={y(t)} /><text className="axis" x={L - 10} y={y(t) + 4} textAnchor="end">{format(t)}</text></g>)}
        {labels.map((l, i) => (i % every === 0 || i === n - 1) && (n - 1 - i >= every || i === n - 1) ? <text key={i} className="axis" x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{l}</text> : null)}
        {series.map(s => {
          const pts = s.values.map((v, i) => [x(i), y(v)] as [number, number])
          const line = smooth(pts, y(0))
          return (
            <g key={s.name}>
              {!s.dashed && <path d={`${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={s.color} opacity={0.07} />}
              <path d={line} fill="none" stroke={s.color} strokeWidth={s.dashed ? 1.6 : 2.2} strokeDasharray={s.dashed ? '4 5' : undefined} strokeLinecap="round" />
            </g>
          )
        })}
        {hover != null && <>
          <line x1={x(hover)} x2={x(hover)} y1={T} y2={height - B} stroke="var(--faint)" strokeDasharray="3 4" />
          {series.map(s => <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill="var(--surface)" stroke={s.color} strokeWidth={2.2} />)}
        </>}
      </svg>
      {tip && hover != null && (
        <div className="tip" style={{ left: Math.min(Math.max(x(hover), 80), w - 80), top: y(Math.max(...series.map(s => s.values[hover]))) }}>
          <b>{tip.title}</b>{tip.lines.map(l => <div key={l}>{l}</div>)}
        </div>
      )}
    </div>
  )
}
