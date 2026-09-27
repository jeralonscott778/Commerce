// Kitchen display: tickets move New → Preparing → Ready → Served. Runs on a tablet in the kitchen.
import { useEffect, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import type { Order } from '../../data/types'
import { PageHead, Empty } from '../../components/ui'
import { cx } from '../../lib/util'

const COLS: { key: NonNullable<Order['kitchenStatus']>; label: string; next?: NonNullable<Order['kitchenStatus']>; action?: string }[] = [
  { key: 'new', label: 'New', next: 'preparing', action: 'Start' },
  { key: 'preparing', label: 'Preparing', next: 'ready', action: 'Ready' },
  { key: 'ready', label: 'Ready to serve', next: 'served', action: 'Served' },
]

const SERVICE = { dine_in: 'Dine in', takeaway: 'Takeaway', delivery: 'Delivery', pickup: 'Pickup' }

export default function Kitchen() {
  const { data, update } = useData()
  const toast = useToast()
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 30000); return () => clearInterval(t) }, [])
  const tickets = data.orders.filter(o => o.kitchenStatus && o.kitchenStatus !== 'served' && o.fulfilmentStatus !== 'cancelled').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const tableName = (id: string | null) => data.tables.find(t => t.id === id)?.name
  const move = (o: Order, to: NonNullable<Order['kitchenStatus']>) => update(d => {
    const x = d.orders.find(y => y.id === o.id); if (!x) return
    x.kitchenStatus = to
    x.timeline.push({ at: new Date().toISOString(), text: to === 'preparing' ? 'Kitchen started preparing' : to === 'ready' ? 'Ready to serve' : 'Served' })
    if (to === 'served' && x.paymentStatus === 'paid' && x.service !== 'delivery') { x.fulfilmentStatus = 'fulfilled'; x.deliveryStatus = 'picked_up' }
  })
  const mins = (o: Order) => Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000)

  return (
    <>
      <PageHead title="Kitchen" subtitle="New orders from the till, website and WhatsApp appear here automatically."
        actions={<button className="btn soft" onClick={() => document.documentElement.requestFullscreen?.().catch(() => toast('Full screen isn’t available here'))}><Maximize2 />Full screen</button>} />
      {!tickets.length ? <div className="card"><Empty title="No orders waiting">New orders will pop up here.</Empty></div> : (
        <div className="kds">
          {COLS.map(c => {
            const list = tickets.filter(t => t.kitchenStatus === c.key)
            return (
              <section key={c.key} className="kds-col">
                <h2>{c.label} <span className="muted num">{list.length}</span></h2>
                {list.map(o => (
                  <article key={o.id} className={cx('ticket', mins(o) >= 20 && 'late', mins(o) >= 12 && mins(o) < 20 && 'slow')}>
                    <header><b>#{o.number}</b><span>{o.tableId ? `Table ${tableName(o.tableId)}` : SERVICE[o.service]}</span><span className="num">{mins(o)} min</span></header>
                    <ul>{o.items.map((i, k) => <li key={k}><b>{i.qty}×</b> {i.title}{i.modifiers?.length ? <div className="xs">{i.modifiers.map(m => m.name).join(' · ')}</div> : null}{i.note ? <div className="xs note">{i.note}</div> : null}</li>)}</ul>
                    {o.note && <p className="xs note">Note: {o.note}</p>}
                    <footer><span className="xs muted">{o.staff ?? (o.channel === 'whatsapp' ? 'WhatsApp' : 'Website')}</span>{c.next && <button className="btn primary sm" onClick={() => move(o, c.next!)}>{c.action}</button>}</footer>
                  </article>
                ))}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
