import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Package, PackageCheck, PackageX, Award, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { useData } from '../data/store'
import { CHANNEL_LABEL, netTotal } from '../data/logic'
import LineChart from '../components/LineChart'
import { Delta, SearchBox, Thumb, useSelection, CheckAll, Menu, Badge } from '../components/ui'
import { addDays, isoDay, money, money0, pct, fShort, currencySymbol } from '../lib/util'
import type { Channel } from '../data/types'
import { ChannelChip } from './orders/shared'

const RANGES = [{ key: 7, label: '7d' }, { key: 30, label: '30d' }, { key: 90, label: '90d' }] as const

export default function Overview() {
  const { data } = useData()
  const nav = useNavigate()
  const [range, setRange] = useState<number>(30)
  const [q, setQ] = useState('')
  const [chan, setChan] = useState<Channel | 'all'>('all')
  const [slide, setSlide] = useState(0)

  const stats = useMemo(() => {
    const start = addDays(-(range - 1)); start.setHours(0, 0, 0, 0)
    const prevStart = addDays(-(2 * range - 1)); prevStart.setHours(0, 0, 0, 0)
    const cur = data.orders.filter(o => new Date(o.createdAt) >= start)
    const prev = data.orders.filter(o => { const t = new Date(o.createdAt); return t >= prevStart && t < start })
    const sum = (l: typeof cur) => l.reduce((s, o) => s + netTotal(o), 0)
    const completed = (l: typeof cur) => l.filter(o => o.fulfilmentStatus === 'fulfilled').length
    const cancelled = (l: typeof cur) => l.filter(o => o.fulfilmentStatus === 'cancelled').length
    const items = (l: typeof cur) => l.filter(o => o.fulfilmentStatus !== 'cancelled').reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0)
    const days = [...Array(range)].map((_, i) => isoDay(addDays(i - range + 1)))
    const perDay = (l: typeof cur, offset: number) => days.map(dk => {
      const key = isoDay(addDays(-offset, new Date(dk + 'T12:00')))
      return l.filter(o => isoDay(o.createdAt) === key).reduce((s, o) => s + netTotal(o), 0)
    })
    const countDay = days.map(dk => cur.filter(o => isoDay(o.createdAt) === dk).length)
    const top = Object.values(cur.filter(o => o.fulfilmentStatus !== 'cancelled').flatMap(o => o.items).reduce<Record<string, { id: string; title: string; hue: number; qty: number }>>((m, it) => {
      (m[it.productId] ??= { id: it.productId, title: it.title, hue: it.hue, qty: 0 }).qty += it.qty; return m
    }, {})).sort((a, b) => b.qty - a.qty).slice(0, 5)
    return {
      sales: sum(cur), salesPrev: sum(prev), orders: cur.length, ordersPrev: prev.length,
      completed: completed(cur), completedPrev: completed(prev), cancelled: cancelled(cur), cancelledPrev: cancelled(prev),
      items: items(cur), itemsPrev: items(prev), days, cur: perDay(cur, 0), prev: perDay(prev, range), countDay, top,
    }
  }, [data.orders, range])

  const recent = data.orders.filter(o => (chan === 'all' || o.channel === chan) && (!q || `${o.number} ${o.customerName} ${o.items.map(i => i.title).join(' ')}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 6)
  const sel = useSelection(recent.map(o => o.id))
  const top = stats.top
  const cur = top.length ? ((slide % top.length) + top.length) % top.length : 0
  const imgOf = (id: string) => data.products.find(p => p.id === id)?.images[0]

  const kpis = [
    { label: 'Total orders', icon: Package, v: stats.orders, p: stats.ordersPrev },
    { label: 'Completed orders', icon: PackageCheck, v: stats.completed, p: stats.completedPrev },
    { label: 'Cancelled orders', icon: PackageX, v: stats.cancelled, p: stats.cancelledPrev, invert: true },
    { label: 'Items sold', icon: Award, v: stats.items, p: stats.itemsPrev },
  ]

  return (
    <>
      <div className="kpis" style={{ marginTop: 8 }}>
        {kpis.map(k => (
          <div className="kpi" key={k.label}>
            <div className="ic"><k.icon /></div>
            <div><div className="lbl">{k.label}</div><div className="val"><b>{k.v}</b><Delta value={pct(k.v, k.p)} /></div></div>
          </div>
        ))}
      </div>

      <section className="card">
        <div className="card-head">
          <div className="grow"><h2>Your sales report</h2><p>Money in from all channels, after refunds</p></div>
          <div className="legend hide-sm"><span><i style={{ background: 'var(--blue)' }} />This period</span><span><i style={{ background: 'var(--orange)' }} />Previous period</span></div>
        </div>
        <div className="card-body report">
          <div className="left">
            <div className="big">{money(stats.sales)}</div>
            <div className="row"><Delta value={pct(stats.sales, stats.salesPrev)} /><span className="small muted">vs previous {range} days ({money0(stats.salesPrev)})</span></div>
            <div className="spacer" />
            <div className="range">{RANGES.map(r => <button key={r.key} className={range === r.key ? 'on' : ''} onClick={() => setRange(r.key)}>{r.label}</button>)}</div>
          </div>
          <LineChart
            labels={stats.days.map(d => fShort(d + 'T12:00'))}
            series={[{ name: 'Previous', color: 'var(--orange)', values: stats.prev, dashed: true }, { name: 'Sales', color: 'var(--blue)', values: stats.cur }]}
            format={v => currencySymbol() + (v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : v)}
            tooltip={i => ({ title: fShort(stats.days[i] + 'T12:00'), lines: [`${money0(stats.cur[i])} sales`, `${stats.countDay[i]} orders`] })}
          />
        </div>
      </section>

      <div className="split">
        <section className="card">
          <div className="toolbar">
            <h2 className="grow">Latest orders</h2>
            <SearchBox value={q} onChange={setQ} placeholder="Search" />
            <Menu trigger={t => <button className="btn icon" onClick={t} aria-label="Filter by channel"><SlidersHorizontal /></button>}>
              {close => <>{(['all', 'online', 'whatsapp', 'instagram', 'phone', 'walk-in'] as const).map(c => (
                <button key={c} onClick={() => { setChan(c); close() }}>{chan === c ? '✓ ' : ''}{c === 'all' ? 'All channels' : CHANNEL_LABEL[c]}</button>
              ))}</>}
            </Menu>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th className="check"><CheckAll all={sel.all} some={sel.some} onChange={sel.toggleAll} /></th><th>Order</th><th>Item</th><th>Date</th><th className="r">Total</th><th>Channel</th></tr></thead>
              <tbody>
                {recent.map(o => (
                  <tr key={o.id} className={'click' + (sel.has(o.id) ? ' selected' : '')} onClick={() => nav(`/orders/${o.id}`)}>
                    <td className="check" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(o.id)} onChange={() => sel.toggle(o.id)} aria-label={`Select order ${o.number}`} /></td>
                    <td className="strong num">#{o.number}</td>
                    <td>{o.items[0]?.title}{o.items.length > 1 && <span className="muted"> +{o.items.length - 1}</span>}</td>
                    <td className="muted num">{fShort(o.createdAt)}</td>
                    <td className="r num">{money(o.total)}</td>
                    <td><ChannelChip channel={o.channel} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recent.length && <div className="empty">No orders match.</div>}
          </div>
          <div className="foot-note row between"><span>{sel.selected.length ? `${sel.selected.length} selected` : `Showing ${recent.length} of ${data.orders.length}`}</span><Link to="/orders">View all orders</Link></div>
        </section>

        <section className="bestseller">
          <div><h2>{top.length ? 'Congratulations!' : 'No sales yet'}</h2><p className="small muted">{top.length ? `These products sold the most in the last ${range} days` : 'Your best sellers will show here'}</p></div>
          {top.length > 0 && (
            <div className="carousel">
              <button className="nav l" onClick={() => setSlide(s => s - 1)} aria-label="Previous product"><ChevronLeft /></button>
              {top.map((t, i) => {
                const off = ((i - cur + top.length + Math.floor(top.length / 2)) % top.length) - Math.floor(top.length / 2)
                const hidden = Math.abs(off) > 1
                return (
                  <Link key={t.id} to={`/products/${t.id}`} className="slide" style={{ transform: `translateX(${off * 58}%) scale(${off === 0 ? 1 : 0.82})`, opacity: hidden ? 0 : off === 0 ? 1 : 0.55, zIndex: 3 - Math.abs(off), pointerEvents: off === 0 ? 'auto' : 'none', textDecoration: 'none', color: 'inherit' }} tabIndex={off === 0 ? 0 : -1}>
                    <Thumb title={t.title} hue={t.hue} image={imgOf(t.id)} />
                    {off === 0 && <><b style={{ fontSize: 14 }}>{t.title}</b><span className="small muted">{t.qty} sold</span></>}
                  </Link>
                )
              })}
              <button className="nav r" onClick={() => setSlide(s => s + 1)} aria-label="Next product"><ChevronRight /></button>
            </div>
          )}
          {top.length > 0 && <div className="row" style={{ justifyContent: 'center' }}><Badge tone="good" plain>#{cur + 1} best seller</Badge></div>}
        </section>
      </div>
    </>
  )
}
