import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, Plus, ShoppingCart } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import { CHANNEL_LABEL, ordersToRows } from '../../data/logic'
import type { Channel, Order } from '../../data/types'
import { PageHead, SearchBox, Tabs, useSelection, CheckAll, Empty, Modal } from '../../components/ui'
import { ChannelChip, PaymentBadge, FulfilBadge, DeliveryBadge } from './shared'
import { downloadFile, fDateTime, isoDay, money, toCSV } from '../../lib/util'

type TabKey = 'all' | 'unfulfilled' | 'unpaid' | 'transit' | 'done' | 'cancelled'
const FILTERS: Record<TabKey, (o: Order) => boolean> = {
  all: () => true,
  unfulfilled: o => o.fulfilmentStatus === 'unfulfilled',
  unpaid: o => o.paymentStatus === 'pending',
  transit: o => o.deliveryStatus === 'out_for_delivery',
  done: o => o.deliveryStatus === 'delivered' || o.deliveryStatus === 'picked_up',
  cancelled: o => o.fulfilmentStatus === 'cancelled',
}

export default function Orders() {
  const { data, update } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const [tab, setTab] = useState<TabKey>('all')
  const [q, setQ] = useState('')
  const [chan, setChan] = useState<Channel | 'all'>('all')
  const [tagModal, setTagModal] = useState(false)
  const [tag, setTag] = useState('')

  const list = useMemo(() => {
    const s = q.toLowerCase().replace('#', '')
    return data.orders.filter(FILTERS[tab]).filter(o => chan === 'all' || o.channel === chan)
      .filter(o => !s || `${o.number} ${o.customerName} ${o.phone} ${o.email} ${o.tags.join(' ')} ${o.tracking}`.toLowerCase().includes(s))
  }, [data.orders, tab, q, chan])
  const sel = useSelection(list.map(o => o.id))
  const picked = data.orders.filter(o => sel.selected.includes(o.id))

  const exportCSV = (rows: Order[], name: string) => {
    if (!rows.length) return toast('No orders to export')
    downloadFile(`${name}-${isoDay(new Date())}.csv`, toCSV(ordersToRows(rows)))
    toast(`Exported ${rows.length} orders`)
  }

  const bulk = (what: 'fulfil' | 'paid') => {
    const now = new Date().toISOString()
    let n = 0
    update(d => {
      for (const o of d.orders) {
        if (!sel.selected.includes(o.id)) continue
        if (what === 'fulfil' && o.fulfilmentStatus === 'unfulfilled') {
          o.fulfilmentStatus = 'fulfilled'; o.deliveryStatus = o.deliveryMethod === 'Store pickup' ? 'packed' : 'out_for_delivery'
          o.timeline.push({ at: now, text: 'Marked as fulfilled' }); n++
        }
        if (what === 'paid' && o.paymentStatus === 'pending') {
          o.paymentStatus = 'paid'; o.timeline.push({ at: now, text: `Payment of ${money(o.total)} recorded` }); n++
        }
      }
    })
    toast(n ? `${n} order${n > 1 ? 's' : ''} ${what === 'fulfil' ? 'marked as fulfilled' : 'marked as paid'}` : 'Nothing to change on the selected orders')
    sel.clear()
  }

  const addTag = () => {
    const t = tag.trim(); if (!t) return
    update(d => d.orders.forEach(o => { if (sel.selected.includes(o.id) && !o.tags.includes(t)) o.tags.push(t) }))
    toast(`Tagged ${sel.selected.length} orders “${t}”`)
    setTag(''); setTagModal(false); sel.clear()
  }

  const counts = (k: TabKey) => data.orders.filter(FILTERS[k]).length

  return (
    <>
      <PageHead title="Orders" subtitle="Every order from your website, WhatsApp, social media and in person."
        actions={<>
          <button className="btn soft" onClick={() => exportCSV(list, 'orders')}><Download />Export</button>
          <Link className="btn primary" to="/orders/new"><Plus />Create order</Link>
        </>} />
      <section className="card">
        <Tabs value={tab} onChange={t => { setTab(t); sel.clear() }} tabs={[
          { key: 'all', label: 'All', count: counts('all') }, { key: 'unfulfilled', label: 'Unfulfilled', count: counts('unfulfilled') },
          { key: 'unpaid', label: 'Unpaid', count: counts('unpaid') }, { key: 'transit', label: 'Out for delivery', count: counts('transit') },
          { key: 'done', label: 'Completed', count: counts('done') }, { key: 'cancelled', label: 'Cancelled', count: counts('cancelled') },
        ]} />
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search order no., customer, phone, tag or tracking" />
          <select value={chan} onChange={e => setChan(e.target.value as Channel | 'all')} style={{ width: 'auto' }} aria-label="Channel">
            <option value="all">All channels</option>
            {(Object.keys(CHANNEL_LABEL) as Channel[]).map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
        </div>
        {sel.selected.length > 0 && (
          <div className="bulkbar">
            <b>{sel.selected.length} selected</b>
            <button className="btn sm" onClick={() => bulk('fulfil')}>Mark as fulfilled</button>
            <button className="btn sm" onClick={() => bulk('paid')}>Mark as paid</button>
            <button className="btn sm" onClick={() => setTagModal(true)}>Add tag</button>
            <button className="btn sm" onClick={() => exportCSV(picked, 'orders-selected')}>Export selected</button>
            <button className="btn sm ghost" onClick={sel.clear}>Clear</button>
          </div>
        )}
        {list.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th className="check"><CheckAll all={sel.all} some={sel.some} onChange={sel.toggleAll} /></th>
                <th>Order</th><th>Date</th><th>Customer</th><th>Channel</th><th className="r">Total</th><th>Payment</th><th>Fulfilment</th><th>Items</th><th>Delivery status</th><th>Delivery method</th><th>Tags</th>
              </tr></thead>
              <tbody>
                {list.map(o => (
                  <tr key={o.id} className={'click' + (sel.has(o.id) ? ' selected' : '')} onClick={() => nav(`/orders/${o.id}`)}>
                    <td className="check" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(o.id)} onChange={() => sel.toggle(o.id)} aria-label={`Select order ${o.number}`} /></td>
                    <td className="strong num">#{o.number}</td>
                    <td className="muted">{fDateTime(o.createdAt)}</td>
                    <td>{o.customerName || <span className="faint">No customer</span>}</td>
                    <td><ChannelChip channel={o.channel} /></td>
                    <td className="r num">{money(o.total)}</td>
                    <td><PaymentBadge o={o} /></td>
                    <td><FulfilBadge o={o} /></td>
                    <td className="muted">{o.items.reduce((s, i) => s + i.qty, 0)} item{o.items.reduce((s, i) => s + i.qty, 0) > 1 ? 's' : ''}</td>
                    <td><DeliveryBadge o={o} /></td>
                    <td className="muted">{o.deliveryMethod}</td>
                    <td>{o.tags.map(t => <span key={t} className="tag" style={{ marginRight: 4 }}>{t}</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No orders here" icon={<ShoppingCart />}>Try another tab or clear the search.</Empty>}
      </section>
      {tagModal && (
        <Modal title="Add a tag" onClose={() => setTagModal(false)} footer={<><button className="btn" onClick={() => setTagModal(false)}>Cancel</button><button className="btn primary" onClick={addTag}>Add tag</button></>}>
          <p className="muted">Tags help you group orders, like “gift”, “wholesale” or “rush”.</p>
          <input type="text" autoFocus value={tag} onChange={e => setTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="Tag name" aria-label="Tag name" />
        </Modal>
      )}
    </>
  )
}
