// Point of sale: staff sign in with a PIN, take orders, send to the kitchen, take payment, and track their shift.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, Minus, Plus, Search, Trash2, ChefHat, Banknote, Smartphone, CreditCard, LogOut, UtensilsCrossed, ShoppingBag, Bike, User } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import type { LineItem, Order, PosStaff, Product, Shift } from '../../data/types'
import { Modal, Thumb, Field, MoneyInput, Badge } from '../../components/ui'
import { cx, fTime, money, money0, uid, isoDay } from '../../lib/util'
import { createOrder } from '../../data/logic'

type Service = Order['service']
const SESSION = 'stockroom-pos-staff'

export function shiftStats(orders: Order[], shift: Shift | undefined) {
  const mine = shift ? orders.filter(o => o.shiftId === shift.id && o.fulfilmentStatus !== 'cancelled') : []
  const paid = mine.filter(o => o.paymentStatus === 'paid')
  const cash = paid.filter(o => o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0)
  const items = mine.flatMap(o => o.items)
  const best = Object.entries(items.reduce<Record<string, number>>((m, i) => { m[i.title] = (m[i.title] ?? 0) + i.qty; return m }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3)
  return {
    orders: mine.length, sales: paid.reduce((s, o) => s + o.total, 0), items: items.reduce((s, i) => s + i.qty, 0), tips: paid.reduce((s, o) => s + o.tip, 0),
    cash, expectedCash: (shift?.openingFloat ?? 0) + cash, open: mine.filter(o => o.paymentStatus === 'pending').length,
    tables: new Set(mine.map(o => o.tableId).filter(Boolean)).size, best,
  }
}

export default function Pos() {
  const { data, update, api } = useData()
  const toast = useToast()
  const [staffId, setStaffId] = useState<string | null>(() => { try { return sessionStorage.getItem(SESSION) } catch { return null } })
  const staff = data.posStaff.find(s => s.id === staffId && s.active)
  const shift = data.shifts.find(s => s.staffId === staffId && !s.endedAt)
  const [locked, setLocked] = useState(!staff)
  const lastActive = useRef(Date.now())
  const lockAfter = (data.store.settings.pos?.lockMinutes ?? 5) * 60000

  // auto-lock after a few idle minutes on shared tablets
  useEffect(() => {
    const bump = () => { lastActive.current = Date.now() }
    window.addEventListener('pointerdown', bump); window.addEventListener('keydown', bump)
    const t = setInterval(() => { if (!locked && Date.now() - lastActive.current > lockAfter) setLocked(true) }, 15000)
    return () => { window.removeEventListener('pointerdown', bump); window.removeEventListener('keydown', bump); clearInterval(t) }
  }, [locked, lockAfter])

  const signIn = (s: PosStaff) => {
    setStaffId(s.id); setLocked(false); lastActive.current = Date.now()
    try { sessionStorage.setItem(SESSION, s.id) } catch { /* ignore */ }
  }

  if (!data.posStaff.length) return (
    <div className="card"><div className="card-body">
      <h2>Set up your till</h2>
      <p className="muted">Add the people who will use the point of sale and give each a PIN. Their sales are tracked separately.</p>
      <div><Link className="btn primary" to="/staff">Add staff</Link></div>
    </div></div>
  )
  if (locked || !staff) return <PinScreen staff={data.posStaff.filter(s => s.active)} onPick={signIn} check={api.checkStaffPin} />
  if (!shift) return <StartShift staff={staff} onStart={float => update(d => { d.shifts.unshift({ id: uid(), storeId: d.store.id, staffId: staff.id, staffName: staff.name, startedAt: new Date().toISOString(), endedAt: null, openingFloat: float, cashCounted: null, expectedCash: null, note: '' }) })} onLock={() => setLocked(true)} />
  return <Register staff={staff} shift={shift} onLock={() => setLocked(true)} onEnd={() => { try { sessionStorage.removeItem(SESSION) } catch { /* ignore */ } setStaffId(null); setLocked(true); toast('Shift closed') }} />
}

function PinScreen({ staff, onPick, check }: { staff: PosStaff[]; onPick: (s: PosStaff) => void; check: (id: string, pin: string) => Promise<boolean> }) {
  const [who, setWho] = useState<PosStaff | null>(null)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const press = async (k: string) => {
    if (!who) return
    setErr('')
    const next = k === 'del' ? pin.slice(0, -1) : (pin + k).slice(0, 6)
    setPin(next)
    if (k === 'del' || next.length < 4) return
    if (await check(who.id, next)) { setPin(''); onPick(who); return }
    if (next.length === 6) { setErr('Wrong PIN. Try again.'); setTimeout(() => setPin(''), 400) }
  }
  return (
    <div className="pos-lock">
      <div className="card" style={{ width: 'min(560px, 100%)' }}><div className="card-body">
        <div className="row"><Lock size={18} /><h2>{who ? `Hi ${who.name.split(' ')[0]}, enter your PIN` : 'Who’s using the till?'}</h2></div>
        {!who ? (
          <div className="staff-grid">{staff.map(s => <button key={s.id} className="staff-btn" onClick={() => setWho(s)}><div className="avatar">{s.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</div><b>{s.name}</b><span className="xs muted" style={{ textTransform: 'capitalize' }}>{s.role}</span></button>)}</div>
        ) : (
          <>
            <div className="pin-dots">{[0, 1, 2, 3, 4, 5].slice(0, Math.max(4, pin.length)).map(i => <i key={i} className={pin.length > i ? 'on' : ''} />)}</div>
            {err && <p className="error" style={{ textAlign: 'center' }}>{err}</p>}
            <div className="keypad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'del'].map(k => (
              <button key={k} className="btn" style={{ height: 56, fontSize: 20 }} onClick={() => k === 'back' ? (setWho(null), setPin('')) : press(k)}>{k === 'del' ? '⌫' : k === 'back' ? '←' : k}</button>
            ))}</div>
          </>
        )}
      </div></div>
    </div>
  )
}

function StartShift({ staff, onStart, onLock }: { staff: PosStaff; onStart: (float: number) => void; onLock: () => void }) {
  const [float, setFloat] = useState<number | null>(staff.role === 'cashier' || staff.role === 'manager' ? 200 : 0)
  return (
    <div className="pos-lock"><div className="card" style={{ width: 'min(460px,100%)' }}><div className="card-body">
      <h2>Start your shift, {staff.name.split(' ')[0]}</h2>
      <p className="muted">Count the cash in the drawer before you start. Everything you sell from now on is recorded under your name.</p>
      <Field label="Cash in drawer (float)" htmlFor="fl"><MoneyInput id="fl" value={float} onChange={setFloat} /></Field>
      <div className="row"><button className="btn" onClick={onLock}>Not me</button><button className="btn primary grow" onClick={() => onStart(float ?? 0)}>Start shift</button></div>
    </div></div></div>
  )
}

interface CartLine extends LineItem { key: string }

function Register({ staff, shift, onLock, onEnd }: { staff: PosStaff; shift: Shift; onLock: () => void; onEnd: () => void }) {
  const { data, update, api } = useData()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [service, setService] = useState<Service>(data.store.businessType === 'restaurant' ? 'dine_in' : 'takeaway')
  const [tableId, setTableId] = useState<string>('')
  const [openOrderId, setOpenOrderId] = useState<string | null>(null)
  const [picking, setPicking] = useState<Product | null>(null)
  const [paying, setPaying] = useState(false)
  const [myShift, setMyShift] = useState(false)
  const [ending, setEnding] = useState(false)
  const [busy, setBusy] = useState(false)
  const restaurant = data.store.businessType === 'restaurant'
  const svcPct = restaurant && service === 'dine_in' ? (data.store.settings.pos?.serviceChargePct ?? 0) : 0

  const products = data.products.filter(p => p.status === 'active' && (cat === 'all' || p.collectionIds.includes(cat)) && (!q || p.title.toLowerCase().includes(q.toLowerCase())))
  const openTabs = data.orders.filter(o => o.channel === 'pos' && o.paymentStatus === 'pending' && o.fulfilmentStatus !== 'cancelled')
  const openOrder = data.orders.find(o => o.id === openOrderId)
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0)
  const stats = shiftStats(data.orders, shift)

  const add = (p: Product, mods: { name: string; price: number }[] = [], variantId?: string) => {
    const v = p.variants.find(x => x.id === variantId) ?? p.variants[0]
    if (v.trackStock && v.stock <= 0) return toast(`${p.title} is out of stock`)
    const key = `${v.id}|${mods.map(m => m.name).join(',')}`
    setCart(c => {
      const ex = c.find(l => l.key === key)
      if (ex) return c.map(l => l.key === key ? { ...l, qty: l.qty + 1 } : l)
      return [...c, { key, productId: p.id, variantId: v.id, title: p.title, variantTitle: v.title, price: v.price + mods.reduce((s, m) => s + m.price, 0), qty: 1, hue: p.hue, image: p.images[0], modifiers: mods }]
    })
  }
  const tap = (p: Product) => (p.modifiers.length || p.variants.length > 1 ? setPicking(p) : add(p))

  // Save the order (sent to kitchen / open tab). Returns the order id.
  const saveOrder = async (paid: boolean, method: Order['paymentMethod'], tip: number): Promise<string | null> => {
    if (!cart.length && !openOrder) return null
    const table = data.tables.find(t => t.id === tableId)
    if (openOrder) {
      update(d => {
        const o = d.orders.find(x => x.id === openOrder.id)!
        if (cart.length) {
          o.items = [...o.items, ...cart.map(({ key: _k, ...l }) => l)]
          o.subtotal = o.items.reduce((s, l) => s + l.price * l.qty, 0)
          o.serviceCharge = Math.round(o.subtotal * svcPct) / 100
          o.kitchenStatus = restaurant ? 'new' : o.kitchenStatus
          o.timeline.push({ at: new Date().toISOString(), text: `${cart.reduce((s, l) => s + l.qty, 0)} more items added by ${staff.name}` })
          for (const l of cart) { const v = d.products.find(p => p.id === l.productId)?.variants.find(x => x.id === l.variantId); if (v?.trackStock) v.stock = Math.max(0, v.stock - l.qty) }
        }
        o.tip = tip
        o.total = o.subtotal + o.serviceCharge + o.tip - o.discountAmount
        if (paid) { o.paymentStatus = 'paid'; o.paymentMethod = method; o.fulfilmentStatus = restaurant ? o.fulfilmentStatus : 'fulfilled'; o.timeline.push({ at: new Date().toISOString(), text: `Paid ${money(o.total)} by ${method === 'cash' ? 'cash' : method === 'momo_manual' ? 'MoMo' : 'card'} (${staff.name})` }) }
        const t = d.tables.find(x => x.id === o.tableId); if (t) t.status = paid ? 'free' : 'ordered'
      })
      return openOrder.id
    }
    const number = await api.nextOrderNumber()
    const id = uid()
    update(d => {
      createOrder(d, {
        customerId: null, customerName: table ? `Table ${table.name}` : service === 'takeaway' ? 'Takeaway' : 'Walk-in', phone: '', email: '', address: { line1: '', city: '', region: '', country: 'Ghana' },
        channel: 'pos', items: cart.map(({ key: _k, ...l }) => l), discount: null, manualDiscount: 0, giftCard: null, deliveryMethod: service === 'dine_in' ? `Dine in${table ? ` · ${table.name}` : ''}` : 'Takeaway', deliveryFee: 0,
        paymentMethod: method, paid, note: '', tags: [], staff: staff.name, staffId: staff.id, shiftId: shift.id, service, serviceCharge: Math.round(subtotal * svcPct) / 100, tip,
        kitchen: restaurant, tableId: table?.id ?? null,
      }, { id, number })
      const o = d.orders.find(x => x.id === id)!
      if (paid && !restaurant) { o.fulfilmentStatus = 'fulfilled'; o.deliveryStatus = 'picked_up' }
      const t = d.tables.find(x => x.id === table?.id); if (t) t.status = paid ? 'free' : 'ordered'
    })
    return id
  }

  const sendToKitchen = async () => {
    if (!cart.length) return toast('Add items first')
    if (service === 'dine_in' && !tableId && !openOrder) return toast('Choose a table')
    setBusy(true)
    try { await saveOrder(false, 'cash', 0); toast(restaurant ? 'Sent to the kitchen' : 'Saved as an open order'); reset() } finally { setBusy(false) }
  }
  const reset = () => { setCart([]); setOpenOrderId(null); setTableId(''); setPaying(false) }
  const loadTab = (o: Order) => { setOpenOrderId(o.id); setCart([]); setService(o.service); setTableId(o.tableId ?? '') }

  const due = (openOrder ? openOrder.subtotal : 0) + subtotal
  const serviceCharge = Math.round(due * svcPct) / 100

  return (
    <div className="pos">
      <div className="pos-top">
        <div className="row"><div className="avatar sm">{staff.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</div><div><b>{staff.name}</b><div className="xs muted">On shift since {fTime(shift.startedAt)}</div></div></div>
        <div className="row wrap">
          <button className="btn soft sm" onClick={() => setMyShift(true)}><User />My shift · {money0(stats.sales)}</button>
          <button className="btn sm" onClick={onLock}><Lock />Switch user</button>
          <button className="btn sm" onClick={() => setEnding(true)}><LogOut />End shift</button>
        </div>
      </div>

      <div className="pos-body">
        <section className="pos-menu card">
          <div className="toolbar" style={{ paddingBottom: 6 }}>
            <label className="search"><Search /><input type="search" placeholder="Search menu" value={q} onChange={e => setQ(e.target.value)} aria-label="Search menu" /></label>
          </div>
          <div className="chips-row">
            <button className={cx('chip', cat === 'all' && 'on')} onClick={() => setCat('all')}>All</button>
            {data.collections.map(c => <button key={c.id} className={cx('chip', cat === c.id && 'on')} onClick={() => setCat(c.id)}>{c.title}</button>)}
          </div>
          <div className="pos-grid">
            {products.map(p => {
              const out = p.variants.every(v => v.trackStock && v.stock <= 0)
              return (
                <button key={p.id} className="pos-item" disabled={out} onClick={() => tap(p)}>
                  <Thumb title={p.title} hue={p.hue} image={p.images[0]} />
                  <b>{p.title}</b>
                  <span className="small">{out ? 'Sold out' : money0(Math.min(...p.variants.map(v => v.price)))}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="pos-cart card">
          <div className="seg-row">
            {([['dine_in', 'Dine in', UtensilsCrossed], ['takeaway', 'Takeaway', ShoppingBag], ['delivery', 'Delivery', Bike]] as const).filter(([k]) => restaurant || k !== 'dine_in').map(([k, l, I]) => (
              <button key={k} className={cx('seg-btn', service === k && 'on')} onClick={() => setService(k)} disabled={!!openOrder}><I size={15} />{l}</button>
            ))}
          </div>
          {service === 'dine_in' && (
            <select value={tableId} onChange={e => { setTableId(e.target.value); const tab = openTabs.find(o => o.tableId === e.target.value); if (tab) loadTab(tab) }} aria-label="Table" disabled={!!openOrder}>
              <option value="">Choose a table…</option>
              {data.tables.map(t => <option key={t.id} value={t.id}>{t.name} · {t.seats} seats{t.status !== 'free' ? ` (${t.status === 'ordered' ? 'open tab' : t.status})` : ''}</option>)}
            </select>
          )}
          {openTabs.length > 0 && !openOrder && (
            <div className="open-tabs"><span className="xs muted">Open tabs</span>{openTabs.slice(0, 8).map(o => <button key={o.id} className="chip" onClick={() => loadTab(o)}>#{o.number} · {o.customerName} · {money0(o.total)}</button>)}</div>
          )}
          {openOrder && <div className="row between small" style={{ background: 'var(--surface-2)', padding: '8px 10px', borderRadius: 8 }}><span>Adding to <b>#{openOrder.number}</b> · {openOrder.customerName} ({money(openOrder.subtotal)} so far)</span><button className="btn ghost sm" onClick={reset}>Close tab</button></div>}

          <div className="cart-lines">
            {openOrder?.items.map((l, i) => <div key={'o' + i} className="cart-line muted"><span className="grow">{l.qty} × {l.title}{l.modifiers?.length ? <span className="xs"> · {l.modifiers.map(m => m.name).join(', ')}</span> : null}</span><span className="num">{money(l.price * l.qty)}</span></div>)}
            {cart.map(l => (
              <div key={l.key} className="cart-line">
                <div className="grow"><div>{l.title}</div>{l.modifiers?.length ? <div className="xs muted">{l.modifiers.map(m => m.name).join(', ')}</div> : null}</div>
                <div className="qty">
                  <button onClick={() => setCart(c => c.map(x => x.key === l.key ? { ...x, qty: Math.max(1, x.qty - 1) } : x))} aria-label="Less"><Minus size={14} /></button>
                  <span className="num">{l.qty}</span>
                  <button onClick={() => setCart(c => c.map(x => x.key === l.key ? { ...x, qty: x.qty + 1 } : x))} aria-label="More"><Plus size={14} /></button>
                </div>
                <span className="num" style={{ width: 80, textAlign: 'right' }}>{money(l.price * l.qty)}</span>
                <button className="btn ghost sm icon" onClick={() => setCart(c => c.filter(x => x.key !== l.key))} aria-label="Remove"><Trash2 /></button>
              </div>
            ))}
            {!cart.length && !openOrder && <div className="empty" style={{ padding: 30 }}>Tap items to add them</div>}
          </div>

          <dl className="kv" style={{ marginTop: 'auto' }}>
            <dt>Subtotal</dt><dd>{money(due)}</dd>
            {serviceCharge > 0 && <><dt>Service charge ({svcPct}%)</dt><dd>{money(serviceCharge)}</dd></>}
            <dt className="total">Total</dt><dd className="total">{money(due + serviceCharge)}</dd>
          </dl>
          <div className="row">
            {restaurant && <button className="btn grow" disabled={busy || !cart.length} onClick={sendToKitchen}><ChefHat />{openOrder ? 'Send additions' : 'Send to kitchen'}</button>}
            <button className="btn primary grow" disabled={busy || (!cart.length && !openOrder)} onClick={() => setPaying(true)}>Charge {money0(due + serviceCharge)}</button>
          </div>
        </section>
      </div>

      {picking && <ModifierPicker product={picking} onClose={() => setPicking(null)} onAdd={(mods, vid) => { add(picking, mods, vid); setPicking(null) }} />}
      {paying && <PayModal total={due + serviceCharge} askTip={restaurant && (data.store.settings.pos?.askTip ?? true)} onClose={() => setPaying(false)} onPay={async (method, tip) => {
        setBusy(true)
        try { const id = await saveOrder(true, method, tip); if (id) toast(`Paid. ${method === 'cash' ? 'Give change if needed.' : ''}`); reset() } finally { setBusy(false) }
      }} />}
      {myShift && <MyShift shift={shift} staff={staff} onClose={() => setMyShift(false)} />}
      {ending && <EndShift shift={shift} onClose={() => setEnding(false)} onDone={(counted, note) => {
        update(d => { const s = d.shifts.find(x => x.id === shift.id)!; s.endedAt = new Date().toISOString(); s.cashCounted = counted; s.expectedCash = stats.expectedCash; s.note = note })
        if (Math.abs(counted - stats.expectedCash) >= 1) update(d => { d.notifications.unshift({ id: uid(), at: new Date().toISOString(), text: `${staff.name}'s cash was ${counted > stats.expectedCash ? 'over' : 'short'} by ${money(Math.abs(counted - stats.expectedCash))}`, link: '/staff', read: false }) })
        onEnd()
      }} />}
    </div>
  )
}

function ModifierPicker({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (mods: { name: string; price: number }[], variantId: string) => void }) {
  const [variant, setVariant] = useState(product.variants[0].id)
  const [chosen, setChosen] = useState<Record<string, string[]>>(() => Object.fromEntries(product.modifiers.filter(g => g.required).map(g => [g.name, [g.choices[0].name]])))
  const toggle = (g: Product['modifiers'][number], name: string) => setChosen(c => {
    const cur = c[g.name] ?? []
    if (g.max === 1) return { ...c, [g.name]: cur[0] === name && !g.required ? [] : [name] }
    return { ...c, [g.name]: cur.includes(name) ? cur.filter(x => x !== name) : cur.length < g.max ? [...cur, name] : cur }
  })
  const mods = product.modifiers.flatMap(g => (chosen[g.name] ?? []).map(n => g.choices.find(c => c.name === n)!)).filter(Boolean)
  const price = (product.variants.find(v => v.id === variant)?.price ?? 0) + mods.reduce((s, m) => s + m.price, 0)
  return (
    <Modal title={product.title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => onAdd(mods, variant)}>Add · {money(price)}</button></>}>
      {product.variants.length > 1 && <div className="field"><span className="lbl">Option</span><div className="row wrap">{product.variants.map(v => <button key={v.id} className={cx('chip', variant === v.id && 'on')} onClick={() => setVariant(v.id)}>{v.title} · {money0(v.price)}</button>)}</div></div>}
      {product.modifiers.map(g => (
        <div key={g.name} className="field"><span className="lbl">{g.name} {g.required ? <Badge plain>Required</Badge> : <span className="xs muted">Optional{g.max > 1 ? `, up to ${g.max}` : ''}</span>}</span>
          <div className="row wrap">{g.choices.map(c => <button key={c.name} className={cx('chip', (chosen[g.name] ?? []).includes(c.name) && 'on')} onClick={() => toggle(g, c.name)}>{c.name}{c.price ? ` +${money0(c.price)}` : ''}</button>)}</div>
        </div>
      ))}
    </Modal>
  )
}

function PayModal({ total, askTip, onClose, onPay }: { total: number; askTip: boolean; onClose: () => void; onPay: (m: Order['paymentMethod'], tip: number) => void }) {
  const [tip, setTip] = useState(0)
  const [given, setGiven] = useState<number | null>(null)
  const grand = total + tip
  return (
    <Modal title={`Charge ${money(grand)}`} onClose={onClose}>
      {askTip && <div className="field"><span className="lbl">Tip</span><div className="row wrap">{[0, 5, 10, 20].map(t => <button key={t} className={cx('chip', tip === t && 'on')} onClick={() => setTip(t)}>{t ? money0(t) : 'No tip'}</button>)}</div></div>}
      <div className="pay-methods">
        <button className="pay-btn" onClick={() => onPay('cash', tip)}><Banknote />Cash</button>
        <button className="pay-btn" onClick={() => onPay('momo_manual', tip)}><Smartphone />MoMo</button>
        <button className="pay-btn" onClick={() => onPay('paystack_card', tip)}><CreditCard />Card</button>
      </div>
      <Field label="Cash received (to work out change)" htmlFor="given"><MoneyInput id="given" value={given} onChange={setGiven} /></Field>
      {given != null && given >= grand && <p className="strong">Change: {money(given - grand)}</p>}
    </Modal>
  )
}

function MyShift({ shift, staff, onClose }: { shift: Shift; staff: PosStaff; onClose: () => void }) {
  const { data } = useData()
  const s = shiftStats(data.orders, shift)
  const mine = data.orders.filter(o => o.shiftId === shift.id)
  return (
    <Modal wide title={`${staff.name.split(' ')[0]}’s shift today`} onClose={onClose}>
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
        <div className="kpi"><div><div className="lbl">Sales</div><div className="val"><b>{money0(s.sales)}</b></div></div></div>
        <div className="kpi"><div><div className="lbl">Orders</div><div className="val"><b>{s.orders}</b></div></div></div>
        <div className="kpi"><div><div className="lbl">Items</div><div className="val"><b>{s.items}</b></div></div></div>
        <div className="kpi"><div><div className="lbl">Tips</div><div className="val"><b>{money0(s.tips)}</b></div></div></div>
      </div>
      <dl className="kv"><dt>Cash collected</dt><dd>{money(s.cash)}</dd><dt>Tables served</dt><dd>{s.tables}</dd><dt>Open tabs</dt><dd>{s.open}</dd><dt>Best sellers</dt><dd>{s.best.map(([t, n]) => `${t} (${n})`).join(', ') || '—'}</dd></dl>
      <div className="table-wrap" style={{ margin: '0 -20px' }}><table><thead><tr><th>Order</th><th>Time</th><th>For</th><th>Status</th><th className="r">Total</th></tr></thead>
        <tbody>{mine.map(o => <tr key={o.id}><td className="strong">#{o.number}</td><td className="muted">{fTime(o.createdAt)}</td><td>{o.customerName}</td><td>{o.paymentStatus === 'paid' ? <Badge tone="good">Paid</Badge> : <Badge tone="warn">Open</Badge>}</td><td className="r num">{money(o.total)}</td></tr>)}</tbody></table>
        {!mine.length && <div className="empty">No orders yet this shift.</div>}
      </div>
    </Modal>
  )
}

function EndShift({ shift, onClose, onDone }: { shift: Shift; onClose: () => void; onDone: (counted: number, note: string) => void }) {
  const { data } = useData()
  const s = shiftStats(data.orders, shift)
  const [counted, setCounted] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const diff = counted == null ? 0 : counted - s.expectedCash
  return (
    <Modal title="End shift" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={counted == null} onClick={() => onDone(counted ?? 0, note)}>Close shift</button></>}>
      {s.open > 0 && <p className="error">You still have {s.open} open tab{s.open > 1 ? 's' : ''}. Hand them over or take payment first.</p>}
      <dl className="kv"><dt>Float at start</dt><dd>{money(shift.openingFloat)}</dd><dt>Cash sales</dt><dd>{money(s.cash)}</dd><dt className="total">Cash expected in drawer</dt><dd className="total">{money(s.expectedCash)}</dd></dl>
      <Field label="Cash counted in drawer" htmlFor="cc"><MoneyInput id="cc" value={counted} onChange={setCounted} /></Field>
      {counted != null && Math.abs(diff) >= 1 && <p className={diff < 0 ? 'error' : 'strong'}>{diff < 0 ? 'Short' : 'Over'} by {money(Math.abs(diff))}. Your manager will see this.</p>}
      <Field label="Note (optional)" htmlFor="sn"><input id="sn" type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Gave GH₵20 change from my own pocket" /></Field>
    </Modal>
  )
}

export function todayShifts(shifts: Shift[]) { const t = isoDay(new Date()); return shifts.filter(s => isoDay(s.startedAt) === t) }
