import { useMemo, useState } from 'react'
import { useData } from '../data/store'
import { CHANNEL_LABEL, METHOD_LABEL, netTotal } from '../data/logic'
import LineChart from '../components/LineChart'
import { PageHead, Delta } from '../components/ui'
import { addDays, currencySymbol, fShort, isoDay, money0, pct } from '../lib/util'

function Bars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map(r => r[1]))
  return (
    <div className="stack" style={{ gap: 10 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 160px) 1fr auto', gap: 10, alignItems: 'center' }}>
          <span className="small ellipsis">{k}</span><div className="bar" style={{ height: 8 }}><i style={{ width: `${(v / max) * 100}%` }} /></div><span className="small num strong">{money0(v)}</span>
        </div>
      ))}
      {!rows.length && <span className="muted small">No sales in this period.</span>}
    </div>
  )
}

export default function Analytics() {
  const { data } = useData()
  const [range, setRange] = useState(30)
  const s = useMemo(() => {
    const start = addDays(-(range - 1)); start.setHours(0, 0, 0, 0)
    const prevStart = addDays(-(2 * range - 1)); prevStart.setHours(0, 0, 0, 0)
    const cur = data.orders.filter(o => new Date(o.createdAt) >= start)
    const prev = data.orders.filter(o => { const t = new Date(o.createdAt); return t >= prevStart && t < start })
    const sum = (l: typeof cur) => l.reduce((a, o) => a + netTotal(o), 0)
    const group = (key: (o: typeof cur[number]) => string) => Object.entries(cur.reduce<Record<string, number>>((m, o) => { const k = key(o); m[k] = (m[k] ?? 0) + netTotal(o); return m }, {})).sort((a, b) => b[1] - a[1])
    const days = [...Array(range)].map((_, i) => isoDay(addDays(i - range + 1)))
    const products = Object.entries(cur.filter(o => o.fulfilmentStatus !== 'cancelled').flatMap(o => o.items).reduce<Record<string, number>>((m, i) => { m[i.title] = (m[i.title] ?? 0) + i.price * i.qty; return m }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8)
    const hours = [...Array(24)].map((_, h) => cur.filter(o => new Date(o.createdAt).getHours() === h).reduce((a, o) => a + netTotal(o), 0))
    const customers = group(o => o.customerName || 'Walk-in').filter(([k]) => !/^(Walk-in|Takeaway|Table )/.test(k)).slice(0, 8)
    const returning = new Set(data.orders.filter(o => new Date(o.createdAt) < start && o.customerId).map(o => o.customerId))
    const repeat = cur.filter(o => o.customerId && returning.has(o.customerId)).length
    return {
      sales: sum(cur), prevSales: sum(prev), orders: cur.length, prevOrders: prev.length, aov: sum(cur) / Math.max(1, cur.length), prevAov: sum(prev) / Math.max(1, prev.length),
      repeatPct: cur.length ? (repeat / cur.filter(o => o.customerId).length || 0) * 100 : 0,
      days, perDay: days.map(d => cur.filter(o => isoDay(o.createdAt) === d).reduce((a, o) => a + netTotal(o), 0)),
      channels: group(o => CHANNEL_LABEL[o.channel]), methods: group(o => METHOD_LABEL[o.paymentMethod]?.split(' ·')[0] ?? o.paymentMethod),
      staff: group(o => o.staff ?? 'Website / WhatsApp'), products, hours, customers,
    }
  }, [data.orders, range])

  return (
    <>
      <PageHead title="Analytics" subtitle="Where your money comes from and what sells."
        actions={<div className="range">{[7, 30, 90].map(r => <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{r} days</button>)}</div>} />
      <div className="kpis">
        <div className="kpi"><div><div className="lbl">Sales</div><div className="val"><b>{money0(s.sales)}</b><Delta value={pct(s.sales, s.prevSales)} /></div></div></div>
        <div className="kpi"><div><div className="lbl">Orders</div><div className="val"><b>{s.orders}</b><Delta value={pct(s.orders, s.prevOrders)} /></div></div></div>
        <div className="kpi"><div><div className="lbl">Average order</div><div className="val"><b>{money0(s.aov)}</b><Delta value={pct(s.aov, s.prevAov)} /></div></div></div>
        <div className="kpi"><div><div className="lbl">Returning customers</div><div className="val"><b>{Math.round(s.repeatPct)}%</b></div></div></div>
      </div>
      <section className="card"><div className="card-head"><h2>Sales per day</h2></div><div className="card-body">
        <LineChart labels={s.days.map(d => fShort(d + 'T12:00'))} series={[{ name: 'Sales', color: 'var(--blue)', values: s.perDay }]} format={v => currencySymbol() + (v >= 1000 ? (v / 1000).toFixed(1).replace('.0', '') + 'k' : v)} tooltip={i => ({ title: fShort(s.days[i] + 'T12:00'), lines: [money0(s.perDay[i])] })} />
      </div></section>
      <div className="cols-2">
        <section className="card"><div className="card-head"><h2>By channel</h2></div><div className="card-body"><Bars rows={s.channels} /></div></section>
        <section className="card"><div className="card-head"><h2>By payment method</h2></div><div className="card-body"><Bars rows={s.methods} /></div></section>
        <section className="card"><div className="card-head"><h2>Top products</h2></div><div className="card-body"><Bars rows={s.products} /></div></section>
        <section className="card"><div className="card-head"><h2>Top customers</h2></div><div className="card-body"><Bars rows={s.customers} /></div></section>
        {data.posStaff.length > 0 && <section className="card"><div className="card-head"><h2>By staff</h2></div><div className="card-body"><Bars rows={s.staff} /></div></section>}
        <section className="card"><div className="card-head"><h2>Busiest hours</h2></div><div className="card-body">
          <div className="hours">{s.hours.map((v, h) => { const m = Math.max(1, ...s.hours); return <div key={h} title={`${h}:00 · ${money0(v)}`}><i style={{ height: `${(v / m) * 100}%` }} /><span className="xs muted">{h % 3 === 0 ? h : ''}</span></div> })}</div>
        </div></section>
      </div>
    </>
  )
}
