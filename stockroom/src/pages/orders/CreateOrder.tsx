import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Plus, Trash2, UserPlus } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import { CHANNEL_LABEL, METHOD_LABEL, computeTotals, createOrder, discountStatus, discountSummary, fullName } from '../../data/logic'
import type { Channel, LineItem, PaymentMethod, Customer } from '../../data/types'
import { PageHead, Thumb, Field, MoneyInput, TagInput, SearchBox } from '../../components/ui'
import ProductPicker from '../../components/ProductPicker'
import { money, uid } from '../../lib/util'

const CHANNELS: Channel[] = ['whatsapp', 'phone', 'instagram', 'walk-in', 'online']
const METHODS: PaymentMethod[] = ['momo_manual', 'cash', 'bank_transfer', 'paystack_momo', 'paystack_card']

export default function CreateOrder() {
  const { draftId } = useParams()
  const { data, update, api } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const draft = draftId ? data.drafts.find(d => d.id === draftId) : undefined
  const [params] = useSearchParams()
  const preId = draft?.customerId ?? params.get('customer')
  const draftCustomer = preId ? data.customers.find(c => c.id === preId) : undefined

  const [items, setItems] = useState<LineItem[]>(draft?.items ?? [])
  const [picker, setPicker] = useState(false)
  const [customer, setCustomer] = useState<Customer | null>(draftCustomer ?? null)
  const [cq, setCq] = useState('')
  const [newCust, setNewCust] = useState(!!draft && !draftCustomer ? { first: draft.customerName, last: '', phone: draft.phone, email: '', line1: '', city: '' } : null as null | { first: string; last: string; phone: string; email: string; line1: string; city: string })
  const [channel, setChannel] = useState<Channel>(draft?.channel ?? 'whatsapp')
  const zones = data.zones.filter(z => z.active)
  const [zone, setZone] = useState(draft?.deliveryMethod ?? zones[0]?.name ?? '')
  const [fee, setFee] = useState<number | null>(draft?.deliveryFee ?? zones[0]?.fee ?? 0)
  const [discountId, setDiscountId] = useState('')
  const [manual, setManual] = useState<number | null>(draft?.discountAmount || null)
  const [giftCode, setGiftCode] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('momo_manual')
  const [paid, setPaid] = useState(false)
  const [note, setNote] = useState(draft?.note ?? '')
  const [tags, setTags] = useState<string[]>([])
  const [staff, setStaff] = useState(data.staff[0]?.name ?? 'Staff')

  const discounts = data.discounts.filter(d => discountStatus(d).label === 'Active')
  const discount = discounts.find(d => d.id === discountId) ?? null
  const gift = giftCode.trim() ? data.giftCards.find(g => g.code.toLowerCase() === giftCode.trim().toLowerCase() && !g.disabled && g.balance > 0 && (!g.expiresAt || g.expiresAt >= new Date().toISOString().slice(0, 10))) ?? null : null
  const totals = useMemo(() => computeTotals({ items, discount, manualDiscount: manual ?? 0, giftCard: gift, deliveryFee: fee ?? 0 }, data.products), [items, discount, manual, gift, fee, data.products])
  const customers = cq ? data.customers.filter(c => `${fullName(c)} ${c.phone} ${c.email}`.toLowerCase().includes(cq.toLowerCase())).slice(0, 6) : []

  const addItems = (add: LineItem[]) => setItems(cur => {
    const next = [...cur]
    for (const a of add) { const ex = next.find(x => x.variantId === a.variantId); ex ? (ex.qty += a.qty) : next.push(a) }
    return next
  })
  const pickZone = (name: string) => { setZone(name); setFee(zones.find(z => z.name === name)?.fee ?? 0) }

  const resolveCustomer = (): { id: string | null; name: string; phone: string; email: string; address: Customer['address'] } | null => {
    if (customer) return { id: customer.id, name: fullName(customer), phone: customer.phone, email: customer.email, address: customer.address }
    if (newCust && (newCust.first.trim() || newCust.phone.trim())) {
      return { id: null, name: `${newCust.first} ${newCust.last}`.trim(), phone: newCust.phone, email: newCust.email, address: { line1: newCust.line1, city: newCust.city, region: '', country: 'Ghana' } }
    }
    return null
  }

  const [busy, setBusy] = useState(false)
  const create = async () => {
    if (!items.length) return toast('Add at least one product')
    const c = resolveCustomer()
    if (!c && channel !== 'walk-in') return toast('Choose or add a customer (or set the channel to Walk-in)')
    if (giftCode.trim() && !gift) return toast('That gift card code isn’t valid or has no balance')
    setBusy(true)
    let number: number
    try { number = await api.nextOrderNumber() } catch { setBusy(false); return toast('Couldn’t get an order number. Check your connection and try again.') }
    const preset = { id: uid(), number }
    const newCid = uid('cu')
    update(d => {
      let cid = c?.id ?? null
      if (c && !cid && newCust) {
        cid = newCid
        d.customers.unshift({ id: cid, storeId: d.store.id, firstName: newCust.first.trim(), lastName: newCust.last.trim(), email: newCust.email.trim(), phone: newCust.phone.trim(), address: { line1: newCust.line1, city: newCust.city, region: '', country: 'Ghana' }, acceptsEmail: false, acceptsWhatsApp: channel === 'whatsapp', tags: [], note: '', createdAt: new Date().toISOString() })
      }
      createOrder(d, { customerId: cid, customerName: c?.name ?? '', phone: c?.phone ?? '', email: c?.email ?? '', address: c?.address ?? { line1: '', city: '', region: '', country: 'Ghana' }, channel, items, discount, manualDiscount: manual ?? 0, giftCard: gift, deliveryMethod: zone, deliveryFee: fee ?? 0, paymentMethod: method, paid, note, tags, staff }, preset)
      if (draft) d.drafts = d.drafts.filter(x => x.id !== draft.id)
    })
    setBusy(false)
    toast(`Order #${preset.number} created`)
    nav(`/orders/${preset.id}`)
  }

  const saveDraft = () => {
    if (!items.length) return toast('Add at least one product first')
    const c = resolveCustomer()
    const draftNewId = uid('dr')
    update(d => {
      const base = { customerId: c?.id ?? null, customerName: c?.name ?? '', phone: c?.phone ?? '', items, discountAmount: totals.discountAmount, deliveryMethod: zone, deliveryFee: fee ?? 0, note, channel }
      if (draft) Object.assign(d.drafts.find(x => x.id === draft.id)!, base)
      else d.drafts.unshift({ id: draftNewId, storeId: d.store.id, number: d.drafts.reduce((m, x) => Math.max(m, x.number), 0) + 1, createdAt: new Date().toISOString(), ...base })
    })
    toast('Draft saved')
    nav('/orders/drafts')
  }

  return (
    <>
      <PageHead back={{ to: draft ? '/orders/drafts' : '/orders', label: draft ? 'Drafts' : 'Orders' }} title={draft ? `Draft #D${draft.number}` : 'Create order'}
        subtitle="For orders that come in by WhatsApp, phone, Instagram DM or in person."
        actions={<><button className="btn" onClick={saveDraft}>Save as draft</button><button className="btn primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create order'}</button></>} />
      <div className="two-col">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Products</h2><button className="btn sm" onClick={() => setPicker(true)}><Plus />Add products</button></div>
            <div className="list" style={{ marginTop: 12 }}>
              {items.map((it, i) => (
                <div className="list-item" key={it.variantId}>
                  <Thumb title={it.title} hue={it.hue} image={it.image} size="sm" />
                  <div className="grow"><div style={{ fontWeight: 500 }}>{it.title}</div><div className="small muted">{it.variantTitle} · {money(it.price)}</div></div>
                  <input type="number" min={1} value={it.qty} style={{ width: 70, height: 34 }} aria-label={`Quantity of ${it.title}`} onChange={e => setItems(s => s.map((x, j) => j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x))} />
                  <span className="num" style={{ width: 96, textAlign: 'right' }}>{money(it.price * it.qty)}</span>
                  <button className="btn ghost sm icon" onClick={() => setItems(s => s.filter((_, j) => j !== i))} aria-label={`Remove ${it.title}`}><Trash2 /></button>
                </div>
              ))}
              {!items.length && <button className="list-item" onClick={() => setPicker(true)}><span className="muted">No products yet. Click to add.</span></button>}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Delivery</h2></div>
            <div className="card-body grid2">
              <Field label="Method" htmlFor="zone"><select id="zone" value={zone} onChange={e => pickZone(e.target.value)}>{zones.map(z => <option key={z.id} value={z.name}>{z.name} ({z.fee ? money(z.fee) : 'free'})</option>)}</select></Field>
              <Field label="Delivery fee" hint="Change it for a special price." htmlFor="fee"><MoneyInput id="fee" value={fee} onChange={setFee} /></Field>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Discount & gift card</h2></div>
            <div className="card-body">
              <div className="grid2">
                <Field label="Discount code" htmlFor="disc" error={discount && totals.discountNote ? totals.discountNote : undefined}>
                  <select id="disc" value={discountId} onChange={e => setDiscountId(e.target.value)}>
                    <option value="">None</option>
                    {discounts.map(d => <option key={d.id} value={d.id}>{d.code || d.title} · {discountSummary(d, data.collections.find(c => c.id === d.appliesTo)?.title)}</option>)}
                  </select>
                </Field>
                <Field label="Extra discount" hint="A one-off amount off, e.g. for a loyal customer." htmlFor="man"><MoneyInput id="man" value={manual} onChange={setManual} placeholder="0.00" /></Field>
              </div>
              <Field label="Gift card code" htmlFor="gc" error={giftCode.trim() && !gift ? 'Code not found, used up or expired' : undefined} hint={gift ? `Balance ${money(gift.balance)}` : undefined}>
                <input id="gc" type="text" className="mono" value={giftCode} onChange={e => setGiftCode(e.target.value.toUpperCase())} placeholder="GIFT-XXXX-XXXX" />
              </Field>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Payment</h2></div>
            <div className="card-body">
              <Field label="How is the customer paying?" htmlFor="pm"><select id="pm" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>{METHODS.map(m => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select></Field>
              <label className="check-row"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /><span>Payment already received<br /><span className="hint">Leave unticked for cash on delivery or if you’re still waiting for MoMo.</span></span></label>
            </div>
          </section>
        </div>

        <aside>
          <section className="card">
            <div className="card-head"><h2>Customer</h2>{!customer && !newCust && <button className="btn sm ghost" onClick={() => setNewCust({ first: '', last: '', phone: '', email: '', line1: '', city: '' })}><UserPlus />New</button>}</div>
            <div className="card-body">
              {customer ? (
                <div className="row"><div className="grow"><b>{fullName(customer)}</b><div className="small muted">{customer.phone}<br />{customer.address.line1}{customer.address.city && `, ${customer.address.city}`}</div></div><button className="btn sm ghost" onClick={() => setCustomer(null)}>Change</button></div>
              ) : newCust ? (
                <div className="stack" style={{ gap: 10 }}>
                  <div className="grid2"><input type="text" placeholder="First name" aria-label="First name" value={newCust.first} onChange={e => setNewCust({ ...newCust, first: e.target.value })} /><input type="text" placeholder="Last name" aria-label="Last name" value={newCust.last} onChange={e => setNewCust({ ...newCust, last: e.target.value })} /></div>
                  <input type="tel" placeholder="Phone / WhatsApp" aria-label="Phone" value={newCust.phone} onChange={e => setNewCust({ ...newCust, phone: e.target.value })} />
                  <input type="email" placeholder="Email (optional)" aria-label="Email" value={newCust.email} onChange={e => setNewCust({ ...newCust, email: e.target.value })} />
                  <input type="text" placeholder="Address / landmark" aria-label="Address" value={newCust.line1} onChange={e => setNewCust({ ...newCust, line1: e.target.value })} />
                  <input type="text" placeholder="City / town" aria-label="City" value={newCust.city} onChange={e => setNewCust({ ...newCust, city: e.target.value })} />
                  <button className="btn sm ghost" onClick={() => setNewCust(null)}>Search existing customers instead</button>
                </div>
              ) : (
                <>
                  <SearchBox value={cq} onChange={setCq} placeholder="Search name or phone" />
                  {customers.map(c => <button key={c.id} className="btn ghost" style={{ justifyContent: 'flex-start', height: 'auto', padding: '8px 10px' }} onClick={() => { setCustomer(c); setCq('') }}><span style={{ textAlign: 'left' }}><b>{fullName(c)}</b><br /><span className="xs muted">{c.phone}</span></span></button>)}
                  {cq && !customers.length && <span className="small muted">No match. Use “New” to add them.</span>}
                </>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Summary</h2></div>
            <div className="card-body">
              <dl className="kv">
                <dt>Subtotal ({items.reduce((s, i) => s + i.qty, 0)} items)</dt><dd>{money(totals.subtotal)}</dd>
                {totals.discountAmount > 0 && <><dt>Discount</dt><dd>−{money(totals.discountAmount)}</dd></>}
                <dt>Delivery</dt><dd>{totals.deliveryFee ? money(totals.deliveryFee) : 'Free'}</dd>
                {totals.giftCardAmount > 0 && <><dt>Gift card</dt><dd>−{money(totals.giftCardAmount)}</dd></>}
                <dt className="total">{paid ? 'Paid' : 'To collect'}</dt><dd className="total">{money(totals.total)}</dd>
              </dl>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Details</h2></div>
            <div className="card-body">
              <Field label="Where did the order come from?" htmlFor="ch"><select id="ch" value={channel} onChange={e => setChannel(e.target.value as Channel)}>{CHANNELS.map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select></Field>
              <Field label="Taken by" htmlFor="staff"><select id="staff" value={staff} onChange={e => setStaff(e.target.value)}>{data.staff.map(s => <option key={s.id}>{s.name}</option>)}</select></Field>
              <Field label="Note" htmlFor="note"><textarea id="note" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Deliver after 4pm" /></Field>
              <Field label="Tags"><TagInput tags={tags} onChange={setTags} /></Field>
            </div>
          </section>
        </aside>
      </div>
      {picker && <ProductPicker onAdd={addItems} onClose={() => setPicker(false)} />}
    </>
  )
}
