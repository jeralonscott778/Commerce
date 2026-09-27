import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import { customerStats, fullName } from '../../data/logic'
import type { Customer } from '../../data/types'
import { PageHead, Field, TagInput, ConfirmButton, Empty, Badge } from '../../components/ui'
import { PaymentBadge, FulfilBadge } from '../orders/shared'
import { fDate, money, uid } from '../../lib/util'

const blank = (storeId: string): Customer => ({ id: '', storeId, firstName: '', lastName: '', email: '', phone: '', address: { line1: '', city: '', region: '', country: 'Ghana' }, acceptsEmail: false, acceptsWhatsApp: false, tags: [], note: '', createdAt: new Date().toISOString() })

export default function CustomerDetail() {
  const { id } = useParams()
  const isNew = id === 'new'
  const { data, update } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const existing = data.customers.find(c => c.id === id)
  const [c, setC] = useState<Customer>(() => existing ? structuredClone(existing) : blank(data.store.id))
  const [dirty, setDirty] = useState(false)
  if (!isNew && !existing) return <><PageHead title="Customer not found" back={{ to: '/customers', label: 'Customers' }} /><Empty title="This customer doesn't exist or was deleted." /></>

  const set = (patch: Partial<Customer>) => { setC(x => ({ ...x, ...patch })); setDirty(true) }
  const setAddr = (patch: Partial<Customer['address']>) => set({ address: { ...c.address, ...patch } })
  const stats = customerStats(data).get(c.id) ?? { orders: 0, spent: 0, lastOrder: null }
  const orders = data.orders.filter(o => o.customerId === c.id)
  const cards = data.giftCards.filter(g => g.customerId === c.id)

  const save = () => {
    if (!c.firstName.trim() && !c.lastName.trim()) return toast('Add the customer’s name')
    if (!c.phone.trim() && !c.email.trim()) return toast('Add a phone number or email')
    const dup = data.customers.find(x => x.id !== c.id && ((c.phone && x.phone.replace(/\s/g, '') === c.phone.replace(/\s/g, '')) || (c.email && x.email.toLowerCase() === c.email.toLowerCase())))
    if (dup) return toast(`${fullName(dup)} already has this phone number or email`)
    const final = { ...c, id: c.id || uid('cu') }
    update(d => { const i = d.customers.findIndex(x => x.id === final.id); if (i >= 0) d.customers[i] = final; else d.customers.unshift(final) })
    setC(final); setDirty(false)
    toast(isNew ? 'Customer added' : 'Customer saved')
    if (isNew) nav(`/customers/${final.id}`, { replace: true })
  }

  return (
    <>
      <PageHead back={{ to: '/customers', label: 'Customers' }} title={isNew ? 'Add customer' : fullName(c) || 'Customer'}
        subtitle={!isNew ? `${c.address.city || 'No location'} · Customer since ${fDate(c.createdAt)}` : undefined}
        actions={<>
          {!isNew && <ConfirmButton onConfirm={() => { update(d => { d.customers = d.customers.filter(x => x.id !== c.id) }); toast('Customer deleted. Their orders were kept.'); nav('/customers') }} confirmText="Click again to delete">Delete</ConfirmButton>}
          {!isNew && <Link className="btn" to={`/orders/new?customer=${c.id}`}><Plus />Create order</Link>}
          <button className="btn primary" onClick={save} disabled={!dirty && !isNew}>Save</button>
        </>} />
      <div className="two-col">
        <div className="stack">
          {!isNew && (
            <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
              <div className="kpi"><div><div className="lbl">Amount spent</div><div className="val"><b>{money(stats.spent, 0)}</b></div></div></div>
              <div className="kpi"><div><div className="lbl">Orders</div><div className="val"><b>{stats.orders}</b></div></div></div>
              <div className="kpi"><div><div className="lbl">Average order</div><div className="val"><b>{money(stats.orders ? stats.spent / stats.orders : 0, 0)}</b></div></div></div>
            </div>
          )}
          {!isNew && (
            <section className="card">
              <div className="card-head"><h2>Orders</h2></div>
              {orders.length ? (
                <div className="table-wrap" style={{ marginTop: 12 }}><table>
                  <thead><tr><th>Order</th><th>Date</th><th>Payment</th><th>Fulfilment</th><th className="r">Total</th></tr></thead>
                  <tbody>{orders.map(o => <tr key={o.id} className="click" onClick={() => nav(`/orders/${o.id}`)}><td className="strong">#{o.number}</td><td className="muted">{fDate(o.createdAt)}</td><td><PaymentBadge o={o} /></td><td><FulfilBadge o={o} /></td><td className="r num">{money(o.total)}</td></tr>)}</tbody>
                </table></div>
              ) : <div className="card-body muted">No orders yet.</div>}
            </section>
          )}
          <section className="card">
            <div className="card-head"><h2>Contact</h2></div>
            <div className="card-body">
              <div className="grid2">
                <Field label="First name" htmlFor="fn"><input id="fn" type="text" value={c.firstName} onChange={e => set({ firstName: e.target.value })} /></Field>
                <Field label="Last name" htmlFor="ln"><input id="ln" type="text" value={c.lastName} onChange={e => set({ lastName: e.target.value })} /></Field>
              </div>
              <div className="grid2">
                <Field label="Phone / WhatsApp" htmlFor="ph"><input id="ph" type="tel" value={c.phone} onChange={e => set({ phone: e.target.value })} placeholder="+233 24 000 0000" /></Field>
                <Field label="Email" htmlFor="em"><input id="em" type="email" value={c.email} onChange={e => set({ email: e.target.value })} /></Field>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Address</h2></div>
            <div className="card-body">
              <Field label="Street address or landmark" htmlFor="a1"><input id="a1" type="text" value={c.address.line1} onChange={e => setAddr({ line1: e.target.value })} placeholder="e.g. Behind Shell, Spintex Road" /></Field>
              <div className="grid3">
                <Field label="City / town" htmlFor="ci"><input id="ci" type="text" value={c.address.city} onChange={e => setAddr({ city: e.target.value })} /></Field>
                <Field label="Region" htmlFor="rg"><input id="rg" type="text" value={c.address.region} onChange={e => setAddr({ region: e.target.value })} list="regions" /></Field>
                <Field label="Country" htmlFor="co"><input id="co" type="text" value={c.address.country} onChange={e => setAddr({ country: e.target.value })} /></Field>
              </div>
              <datalist id="regions">{['Greater Accra', 'Ashanti', 'Central', 'Western', 'Eastern', 'Volta', 'Northern', 'Upper East', 'Upper West', 'Bono', 'Bono East', 'Ahafo', 'Western North', 'Oti', 'Savannah', 'North East'].map(r => <option key={r} value={r} />)}</datalist>
            </div>
          </section>
        </div>
        <aside>
          <section className="card">
            <div className="card-head"><h2>Marketing</h2></div>
            <div className="card-body">
              <label className="check-row"><input type="checkbox" checked={c.acceptsWhatsApp} onChange={e => set({ acceptsWhatsApp: e.target.checked })} /><span>Agreed to WhatsApp offers</span></label>
              <label className="check-row"><input type="checkbox" checked={c.acceptsEmail} onChange={e => set({ acceptsEmail: e.target.checked })} /><span>Agreed to email offers</span></label>
              <span className="hint">Only tick these if the customer said yes. It’s how you stay on the right side of spam rules.</span>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Tags</h2></div>
            <div className="card-body"><TagInput tags={c.tags} onChange={t => set({ tags: t })} /></div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Notes</h2></div>
            <div className="card-body"><textarea rows={3} value={c.note} onChange={e => set({ note: e.target.value })} placeholder="Sizes, preferences, birthdays…" aria-label="Notes" /></div>
          </section>
          {!isNew && (
            <section className="card">
              <div className="card-head"><h2>Gift cards</h2><Link className="btn sm ghost" to="/gift-cards">Manage</Link></div>
              <div className="card-body">{cards.length ? cards.map(g => <div key={g.id} className="row between"><span className="code-chip">{g.code}</span><span className="num">{money(g.balance)}</span></div>) : <span className="muted small">None</span>}{stats.orders >= 5 && <Badge tone="info" plain>Loyal customer</Badge>}</div>
            </section>
          )}
        </aside>
      </div>
    </>
  )
}
