import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Truck, CreditCard, MessageSquare, Copy } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import { METHOD_LABEL, DELIVERY_LABEL, adjustStock } from '../../data/logic'
import { PageHead, Thumb, Modal, TagInput, ConfirmButton, MoneyInput, Field, Empty } from '../../components/ui'
import { ChannelChip, PaymentBadge, FulfilBadge, DeliveryBadge } from './shared'
import { fDateTime, money } from '../../lib/util'
import type { Order } from '../../data/types'

const CARRIERS = ['Own rider', 'Yango Delivery', 'Bolt Send', 'Glovo', 'VIP Bus parcel', 'STC parcel', 'DHL', 'Other']

export default function OrderDetail() {
  const { id } = useParams()
  const { data, update } = useData()
  const toast = useToast()
  const o = data.orders.find(x => x.id === id)
  const [fulfil, setFulfil] = useState(false)
  const [carrier, setCarrier] = useState(CARRIERS[0])
  const [tracking, setTracking] = useState('')
  const [refund, setRefund] = useState(false)
  const [refundAmt, setRefundAmt] = useState<number | null>(null)
  const [restock, setRestock] = useState(true)
  const [note, setNote] = useState('')

  if (!o) return <><PageHead title="Order not found" back={{ to: '/orders', label: 'Orders' }} /><Empty title="This order doesn't exist or was deleted." /></>

  const edit = (fn: (x: Order) => void, msg?: string) => {
    update(d => { const x = d.orders.find(y => y.id === o.id); if (x) fn(x) })
    if (msg) toast(msg)
  }
  const now = () => new Date().toISOString()
  const isPickup = o.deliveryMethod === 'Store pickup'
  const due = o.total - o.giftCardAmount

  const doFulfil = () => {
    edit(x => {
      x.fulfilmentStatus = 'fulfilled'
      x.deliveryStatus = isPickup ? 'packed' : 'out_for_delivery'
      x.carrier = isPickup ? '' : carrier; x.tracking = isPickup ? '' : tracking.trim()
      x.timeline.push({ at: now(), text: isPickup ? 'Packed and ready for pickup' : `Handed to ${carrier}${tracking.trim() ? ` (tracking ${tracking.trim()})` : ''}` })
    }, isPickup ? 'Marked ready for pickup' : 'Order fulfilled and out for delivery')
    setFulfil(false)
  }
  const doRefund = () => {
    const amt = Math.min(refundAmt ?? due - o.refunded, due - o.refunded)
    if (!(amt > 0)) return toast('Enter an amount to refund')
    update(d => {
      const x = d.orders.find(y => y.id === o.id); if (!x) return
      x.refunded += amt
      x.paymentStatus = x.refunded >= due ? 'refunded' : 'partially_refunded'
      x.timeline.push({ at: now(), text: `Refunded ${money(amt)} to ${METHOD_LABEL[x.paymentMethod]}${restock ? ', items returned to stock' : ''}` })
      if (restock && x.refunded >= due) adjustStock(d, x.items, 1)
    })
    toast(`Refund of ${money(amt)} recorded`)
    setRefund(false)
  }
  const cancel = () => {
    update(d => {
      const x = d.orders.find(y => y.id === o.id); if (!x) return
      x.fulfilmentStatus = 'cancelled'; x.deliveryStatus = 'none'
      if (x.paymentStatus === 'pending') x.paymentStatus = 'voided'
      else if (x.paymentStatus === 'paid') { x.refunded = due; x.paymentStatus = 'refunded' }
      adjustStock(d, x.items, 1)
      x.timeline.push({ at: now(), text: 'Order cancelled, items returned to stock' })
    })
    toast(`Order #${o.number} cancelled`)
  }
  const statusText = `Hi ${o.customerName.split(' ')[0] || 'there'}, your ${data.store.name} order #${o.number} is ${o.fulfilmentStatus === 'cancelled' ? 'cancelled' : DELIVERY_LABEL[o.deliveryStatus].toLowerCase()}.${o.tracking ? ` Tracking: ${o.carrier} ${o.tracking}.` : ''} Total ${money(o.total)}. Thank you!`
  const copyUpdate = async () => {
    try { await navigator.clipboard.writeText(statusText); toast('Message copied. Paste it into WhatsApp or SMS.') } catch { toast(statusText) }
  }

  return (
    <>
      <PageHead back={{ to: '/orders', label: 'Orders' }}
        title={<span className="row wrap" style={{ gap: 10 }}>#{o.number}<PaymentBadge o={o} /><FulfilBadge o={o} /></span>}
        subtitle={<span className="row wrap" style={{ gap: 8 }}>{fDateTime(o.createdAt)} · <ChannelChip channel={o.channel} />{o.staff && <span>· by {o.staff}</span>}</span>}
        actions={<>
          <button className="btn soft" onClick={copyUpdate}><Copy />Copy update for customer</button>
          {o.fulfilmentStatus === 'unfulfilled' && <ConfirmButton onConfirm={cancel} confirmText="Click again to cancel">Cancel order</ConfirmButton>}
        </>} />

      <div className="two-col">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Items</h2><DeliveryBadge o={o} /></div>
            <div className="list" style={{ marginTop: 12 }}>
              {o.items.map((it, i) => {
                const p = data.products.find(x => x.id === it.productId)
                return (
                  <div key={i} className="list-item">
                    <Thumb title={it.title} hue={it.hue} image={p?.images[0]} />
                    <div className="grow"><Link to={`/products/${it.productId}`} style={{ fontWeight: 500 }}>{it.title}</Link><div className="small muted">{it.variantTitle} · {money(it.price)} × {it.qty}</div></div>
                    <span className="num">{money(it.price * it.qty)}</span>
                  </div>
                )
              })}
            </div>
            <div className="card-body" style={{ borderTop: '1px solid var(--line-2)' }}>
              <div className="row wrap between">
                <span className="small muted">
                  <Truck size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />{o.deliveryMethod}
                  {o.carrier && ` · ${o.carrier}`}{o.tracking && <> · <span className="mono">{o.tracking}</span></>}
                </span>
                <div className="row wrap">
                  {o.fulfilmentStatus === 'unfulfilled' && <button className="btn primary" onClick={() => setFulfil(true)}>{isPickup ? 'Mark ready for pickup' : 'Fulfil items'}</button>}
                  {o.fulfilmentStatus === 'fulfilled' && !isPickup && o.deliveryStatus === 'out_for_delivery' && <button className="btn primary" onClick={() => edit(x => { x.deliveryStatus = 'delivered'; if (x.paymentMethod === 'cash' && x.paymentStatus === 'pending') { x.paymentStatus = 'paid'; x.timeline.push({ at: now(), text: `Cash of ${money(x.total)} collected on delivery` }) } x.timeline.push({ at: now(), text: 'Delivered' }) }, 'Marked as delivered')}>Mark as delivered</button>}
                  {o.fulfilmentStatus === 'fulfilled' && isPickup && o.deliveryStatus !== 'picked_up' && <button className="btn primary" onClick={() => edit(x => { x.deliveryStatus = 'picked_up'; x.timeline.push({ at: now(), text: 'Picked up by customer' }) }, 'Marked as picked up')}>Mark as picked up</button>}
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Payment</h2><PaymentBadge o={o} /></div>
            <div className="card-body">
              <dl className="kv">
                <dt>Subtotal</dt><dd>{money(o.subtotal)}</dd>
                {o.discountAmount > 0 && <><dt>Discount {o.discountCode && <span className="code-chip" style={{ marginLeft: 6 }}>{o.discountCode}</span>}</dt><dd>−{money(o.discountAmount)}</dd></>}
                {o.discountCode && !o.discountAmount && <><dt>Discount <span className="code-chip" style={{ marginLeft: 6 }}>{o.discountCode}</span></dt><dd>Free delivery</dd></>}
                <dt>Delivery ({o.deliveryMethod})</dt><dd>{o.deliveryFee ? money(o.deliveryFee) : 'Free'}</dd>
                <dt className="total">Total</dt><dd className="total">{money(o.total)}</dd>
                {o.giftCardAmount > 0 && <><dt>Paid by gift card <span className="mono">{o.giftCardCode}</span></dt><dd>{money(o.giftCardAmount)}</dd></>}
                <dt>{o.paymentStatus === 'pending' ? 'To collect' : 'Paid'} ({METHOD_LABEL[o.paymentMethod]})</dt><dd>{money(due)}</dd>
                {o.refunded > 0 && <><dt>Refunded</dt><dd>−{money(o.refunded)}</dd></>}
              </dl>
              <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
                {o.paymentStatus === 'pending' && o.fulfilmentStatus !== 'cancelled' && <button className="btn primary" onClick={() => edit(x => { x.paymentStatus = 'paid'; x.timeline.push({ at: now(), text: `Payment of ${money(due)} recorded` }) }, 'Payment recorded')}><CreditCard />Record payment</button>}
                {(o.paymentStatus === 'paid' || o.paymentStatus === 'partially_refunded') && <button className="btn" onClick={() => { setRefundAmt(due - o.refunded); setRefund(true) }}>Refund</button>}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Timeline</h2></div>
            <div className="card-body">
              <div className="row">
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Leave a note for your team (e.g. customer called, rider delayed)" aria-label="Add note"
                  onKeyDown={e => { if (e.key === 'Enter' && note.trim()) { edit(x => x.timeline.push({ at: now(), text: note.trim(), by: 'You' })); setNote('') } }} />
                <button className="btn" disabled={!note.trim()} onClick={() => { edit(x => x.timeline.push({ at: now(), text: note.trim(), by: 'You' })); setNote('') }}><MessageSquare />Post</button>
              </div>
              <div className="timeline">
                {[...o.timeline].reverse().map((t, i) => <div key={i}><span className="xs muted">{fDateTime(t.at)}{t.by ? ` · ${t.by}` : ''}</span><br />{t.text}</div>)}
              </div>
            </div>
          </section>
        </div>

        <aside>
          <section className="card">
            <div className="card-head"><h2>Customer</h2></div>
            <div className="card-body">
              {o.customerId ? <Link to={`/customers/${o.customerId}`} className="strong">{o.customerName}</Link> : <b>{o.customerName || 'Walk-in customer'}</b>}
              <div className="small"><div>{o.phone || <span className="faint">No phone</span>}</div><div className="muted">{o.email}</div></div>
              <div className="divider" />
              <div className="small"><div className="lbl" style={{ marginBottom: 4 }}>Delivery address</div>{o.address.line1 ? <>{o.address.line1}<br />{o.address.city}, {o.address.region}<br />{o.address.country}</> : <span className="faint">No address</span>}</div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Notes</h2></div>
            <div className="card-body"><textarea value={o.note} onChange={e => edit(x => { x.note = e.target.value })} placeholder="Delivery instructions or anything the customer asked for" aria-label="Order notes" rows={3} /></div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Tags</h2></div>
            <div className="card-body"><TagInput tags={o.tags} onChange={t => edit(x => { x.tags = t })} /></div>
          </section>
        </aside>
      </div>

      {fulfil && (
        <Modal title={isPickup ? 'Ready for pickup' : 'Fulfil items'} onClose={() => setFulfil(false)}
          footer={<><button className="btn" onClick={() => setFulfil(false)}>Cancel</button><button className="btn primary" onClick={doFulfil}>{isPickup ? 'Mark ready' : 'Fulfil and send'}</button></>}>
          <p className="muted">{o.items.reduce((s, i) => s + i.qty, 0)} items for {o.customerName || 'this customer'} · {o.deliveryMethod}</p>
          {!isPickup && <>
            <Field label="Delivered by" htmlFor="carrier"><select id="carrier" value={carrier} onChange={e => setCarrier(e.target.value)}>{CARRIERS.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Tracking or waybill number" hint="Optional. Add it if the courier gave you one." htmlFor="trk"><input id="trk" type="text" value={tracking} onChange={e => setTracking(e.target.value)} /></Field>
          </>}
        </Modal>
      )}
      {refund && (
        <Modal title="Refund payment" onClose={() => setRefund(false)}
          footer={<><button className="btn" onClick={() => setRefund(false)}>Cancel</button><button className="btn primary" onClick={doRefund}>Refund {money(refundAmt ?? 0)}</button></>}>
          <Field label="Amount to refund" hint={`Up to ${money(due - o.refunded)}. Online payments go back through ${METHOD_LABEL[o.paymentMethod].split(' ·')[0]}.`} htmlFor="ramt">
            <MoneyInput id="ramt" value={refundAmt} onChange={setRefundAmt} />
          </Field>
          <label className="check-row"><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} />Return items to stock (on full refund)</label>
        </Modal>
      )}
    </>
  )
}
