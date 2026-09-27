import { useNavigate, Link } from 'react-router-dom'
import { FileText, ShoppingBag, Copy, Plus } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import { PageHead, Empty, Badge, ConfirmButton, Thumb } from '../../components/ui'
import { ChannelChip } from './shared'
import { fDateTime, money, ago } from '../../lib/util'

export function Drafts() {
  const { data, update } = useData()
  const toast = useToast()
  const nav = useNavigate()
  return (
    <>
      <PageHead back={{ to: '/orders', label: 'Orders' }} title="Draft orders"
        subtitle="Orders you’ve started but not confirmed, e.g. while a customer decides or sends MoMo."
        actions={<Link className="btn primary" to="/orders/new"><Plus />Create order</Link>} />
      <section className="card">
        {data.drafts.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Draft</th><th>Created</th><th>Customer</th><th>Channel</th><th>Items</th><th className="r">Total</th><th></th></tr></thead>
            <tbody>{data.drafts.map(d => {
              const total = d.items.reduce((s, i) => s + i.price * i.qty, 0) - d.discountAmount + d.deliveryFee
              return (
                <tr key={d.id} className="click" onClick={() => nav(`/orders/drafts/${d.id}`)}>
                  <td className="strong">#D{d.number}</td><td className="muted">{fDateTime(d.createdAt)}</td>
                  <td>{d.customerName || <span className="faint">No customer</span>}</td><td><ChannelChip channel={d.channel} /></td>
                  <td className="muted">{d.items.reduce((s, i) => s + i.qty, 0)} items</td><td className="r num">{money(total)}</td>
                  <td className="r" onClick={e => e.stopPropagation()}><ConfirmButton className="btn sm danger" onConfirm={() => { update(x => { x.drafts = x.drafts.filter(y => y.id !== d.id) }); toast('Draft deleted') }}>Delete</ConfirmButton></td>
                </tr>
              )
            })}</tbody>
          </table></div>
        ) : <Empty title="No drafts" icon={<FileText />}>Use “Save as draft” when creating an order.</Empty>}
      </section>
    </>
  )
}

export function Abandoned() {
  const { data, update } = useData()
  const toast = useToast()
  // Checkouts paid straight away aren't abandoned; unpaid ones show after 20 minutes.
  const list = data.abandoned.filter(a => a.completed ? !!a.remindedAt : Date.now() - new Date(a.createdAt).getTime() > 20 * 60000)
  const open = list.filter(a => !a.recovered)
  const recoveredValue = list.filter(a => a.recovered).reduce((s, a) => s + a.total, 0)

  const message = (a: typeof list[number]) =>
    `Hi ${a.customerName.split(' ')[0]}, you left ${a.items.map(i => i.title).join(', ')} in your cart at ${data.store.name}. It’s still waiting for you: https://${data.store.domain}/cart/${a.id}`

  const remind = async (a: typeof list[number]) => {
    try { await navigator.clipboard.writeText(message(a)); toast('Reminder copied. Paste it into WhatsApp.') } catch { toast(message(a)) }
    update(d => { const x = d.abandoned.find(y => y.id === a.id); if (x) x.remindedAt = new Date().toISOString() })
  }

  return (
    <>
      <PageHead back={{ to: '/orders', label: 'Orders' }} title="Abandoned checkouts"
        subtitle="People who started checkout on your website but didn’t pay. A friendly reminder often brings them back." />
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <div className="kpi"><div><div className="lbl">Waiting</div><div className="val"><b>{open.length}</b></div></div></div>
        <div className="kpi"><div><div className="lbl">Value left in carts</div><div className="val"><b>{money(open.reduce((s, a) => s + a.total, 0), 0)}</b></div></div></div>
        <div className="kpi"><div><div className="lbl">Recovered</div><div className="val"><b>{money(recoveredValue, 0)}</b></div></div></div>
      </div>
      <section className="card">
        {list.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Started</th><th>Customer</th><th>Cart</th><th className="r">Value</th><th>Status</th><th></th></tr></thead>
            <tbody>{list.map(a => (
              <tr key={a.id}>
                <td className="muted">{fDateTime(a.createdAt)}</td>
                <td><b style={{ fontWeight: 500 }}>{a.customerName}</b><div className="xs muted">{a.phone}</div></td>
                <td><div className="row">{a.items.map((i, k) => <Thumb key={k} title={i.title} hue={i.hue} size="sm" />)}<span className="small">{a.items.map(i => i.title).join(', ')}</span></div></td>
                <td className="r num">{money(a.total)}</td>
                <td>{a.recovered ? <Badge tone="good">Recovered</Badge> : a.remindedAt ? <Badge tone="info">Reminded {ago(a.remindedAt)}</Badge> : <Badge tone="warn">Not contacted</Badge>}</td>
                <td className="r">{!a.recovered && <button className="btn sm" onClick={() => remind(a)}><Copy />Copy WhatsApp reminder</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title="No abandoned checkouts" icon={<ShoppingBag />} />}
        <div className="foot-note">When WhatsApp ordering is connected, reminders can be sent automatically an hour after someone leaves.</div>
      </section>
    </>
  )
}
