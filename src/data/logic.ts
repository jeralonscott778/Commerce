// Business rules shared by the screens (and later by the website and POS).
import type { Customer, Discount, Order, Product, Segment, StoreData, Variant, LineItem, Channel, PaymentMethod, GiftCard } from './types'
import { isoDay, money0, today, addDays, uid, slug } from '../lib/util'

export const CHANNEL_LABEL: Record<Channel, string> = {
  online: 'Online store', whatsapp: 'WhatsApp', pos: 'Point of sale', phone: 'Phone', instagram: 'Instagram', 'walk-in': 'Walk-in',
}
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  paystack_momo: 'Paystack · Mobile Money', paystack_card: 'Paystack · Card', flutterwave: 'Flutterwave', stripe: 'Stripe · Card',
  cash: 'Cash', momo_manual: 'MoMo (manual)', bank_transfer: 'Bank transfer', gift_card: 'Gift card',
}
export const DELIVERY_LABEL: Record<Order['deliveryStatus'], string> = {
  none: 'Not started', packed: 'Packed / ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered', picked_up: 'Picked up',
}
export const PAYMENT_LABEL: Record<Order['paymentStatus'], string> = {
  paid: 'Paid', pending: 'Payment pending', partially_refunded: 'Partly refunded', refunded: 'Refunded', voided: 'Voided',
}

export const fullName = (c: Pick<Customer, 'firstName' | 'lastName'>) => `${c.firstName} ${c.lastName}`.trim()
export const stockOf = (p: Product) => p.variants.reduce((s, v) => s + (v.trackStock ? v.stock : 0), 0)
export const priceRange = (p: Product) => {
  const ps = p.variants.map(v => v.price)
  const lo = Math.min(...ps), hi = Math.max(...ps)
  return lo === hi ? money0(lo) : `${money0(lo)} – ${money0(hi)}`
}
export const countsTowardSales = (o: Order) => o.fulfilmentStatus !== 'cancelled' && o.paymentStatus !== 'voided'
export const netTotal = (o: Order) => (countsTowardSales(o) ? o.total - o.refunded : 0)

// ---------- customers ----------
export interface CustomerStats { orders: number; spent: number; lastOrder: string | null }
export function customerStats(d: StoreData): Map<string, CustomerStats> {
  const m = new Map<string, CustomerStats>()
  for (const c of d.customers) m.set(c.id, { orders: 0, spent: 0, lastOrder: null })
  for (const o of d.orders) {
    if (!o.customerId) continue
    const s = m.get(o.customerId); if (!s) continue
    s.orders++
    s.spent += netTotal(o)
    if (!s.lastOrder || o.createdAt > s.lastOrder) s.lastOrder = o.createdAt
  }
  return m
}

export function inSegment(c: Customer, s: CustomerStats | undefined, seg: Segment): boolean {
  const st = s ?? { orders: 0, spent: 0, lastOrder: null }
  const r = seg.rule
  switch (r.kind) {
    case 'spent_over': return st.spent >= r.amount
    case 'orders_at_least': return st.orders >= r.count
    case 'no_order_days': return !st.lastOrder || new Date(st.lastOrder) < addDays(-r.days)
    case 'city': return c.address.city.toLowerCase() === r.city.toLowerCase() || c.address.region.toLowerCase() === r.city.toLowerCase()
    case 'accepts_marketing': return c.acceptsEmail || c.acceptsWhatsApp
    case 'tag': return c.tags.map(t => t.toLowerCase()).includes(r.tag.toLowerCase())
  }
}
export function describeRule(seg: Segment) {
  const r = seg.rule
  switch (r.kind) {
    case 'spent_over': return `Spent ${money0(r.amount)} or more`
    case 'orders_at_least': return `Placed ${r.count}+ orders`
    case 'no_order_days': return `No order in the last ${r.days} days`
    case 'city': return `Lives in ${r.city}`
    case 'accepts_marketing': return 'Agreed to email or WhatsApp marketing'
    case 'tag': return `Tagged “${r.tag}”`
  }
}

// ---------- discounts ----------
export function discountStatus(d: Discount): { label: string; tone: 'good' | 'info' | 'neutral' | 'warn' } {
  const t = isoDay(today())
  if (d.paused) return { label: 'Paused', tone: 'neutral' }
  if (d.startsAt > t) return { label: 'Scheduled', tone: 'info' }
  if (d.endsAt && d.endsAt < t) return { label: 'Expired', tone: 'neutral' }
  if (d.usageLimit && d.uses >= d.usageLimit) return { label: 'Used up', tone: 'neutral' }
  return { label: 'Active', tone: 'good' }
}
export function discountSummary(d: Discount, collectionName?: string) {
  let s = d.type === 'percent' ? `${d.value || 0}% off` : d.type === 'fixed' ? `${money0(d.value)} off` : d.type === 'free_delivery' ? 'Free delivery' : `Buy ${d.buyQty}, get ${d.getQty} free`
  if (d.appliesTo !== 'all') s += ` · ${collectionName ?? 'one collection'}`
  else if (d.type === 'percent' || d.type === 'fixed') s += ' · all products'
  if (d.minSpend) s += ` · orders over ${money0(d.minSpend)}`
  if (d.eligibility === 'first_order') s += ' · first order only'
  return s
}

/** Works out what a discount takes off a cart. Used by "Create order" and later by the website checkout. */
export function applyDiscount(d: Discount, items: LineItem[], products: Product[], deliveryFee: number): { amount: number; freeDelivery: boolean; reason?: string } {
  const st = discountStatus(d)
  if (st.label !== 'Active') return { amount: 0, freeDelivery: false, reason: `This discount is ${st.label.toLowerCase()}` }
  const inScope = (it: LineItem) => d.appliesTo === 'all' || !!products.find(p => p.id === it.productId)?.collectionIds.includes(d.appliesTo)
  const scoped = items.filter(inScope)
  const subtotal = items.reduce((s, x) => s + x.price * x.qty, 0)
  if (d.minSpend && subtotal < d.minSpend) return { amount: 0, freeDelivery: false, reason: `Needs a minimum spend of ${money0(d.minSpend)}` }
  const scopedTotal = scoped.reduce((s, x) => s + x.price * x.qty, 0)
  if (!scoped.length) return { amount: 0, freeDelivery: false, reason: 'No items in the cart qualify' }
  switch (d.type) {
    case 'percent': return { amount: Math.round(scopedTotal * d.value) / 100, freeDelivery: false }
    case 'fixed': return { amount: Math.min(d.value, scopedTotal), freeDelivery: false }
    case 'free_delivery': return { amount: 0, freeDelivery: deliveryFee > 0 }
    case 'buy_x_get_y': {
      const units = scoped.flatMap(x => Array(x.qty).fill(x.price) as number[]).sort((a, b) => a - b)
      const groups = Math.floor(units.length / (d.buyQty + d.getQty))
      const free = units.slice(0, groups * d.getQty).reduce((s, x) => s + x, 0)
      return free ? { amount: free, freeDelivery: false } : { amount: 0, freeDelivery: false, reason: `Add ${d.buyQty + d.getQty} qualifying items` }
    }
  }
}

// ---------- orders ----------
export function nextOrderNumber(d: StoreData) {
  return d.orders.reduce((m, o) => Math.max(m, o.number), 1000) + 1
}

export function adjustStock(d: StoreData, items: LineItem[], dir: -1 | 1) {
  for (const it of items) {
    const v = d.products.find(p => p.id === it.productId)?.variants.find(x => x.id === it.variantId)
    if (v && v.trackStock) v.stock = Math.max(0, v.stock + dir * it.qty)
  }
}

export interface NewOrderInput {
  customerId: string | null
  customerName: string
  phone: string
  email: string
  address: Order['address']
  channel: Channel
  items: LineItem[]
  discount: Discount | null
  manualDiscount: number
  giftCard: GiftCard | null
  deliveryMethod: string
  deliveryFee: number
  paymentMethod: PaymentMethod
  paid: boolean
  note: string
  tags: string[]
  staff: string
  service?: Order['service']
  serviceCharge?: number
  tip?: number
  kitchen?: boolean
  tableId?: string | null
  staffId?: string | null
  shiftId?: string | null
}

export function computeTotals(input: Pick<NewOrderInput, 'items' | 'discount' | 'manualDiscount' | 'giftCard' | 'deliveryFee'>, products: Product[]) {
  const subtotal = input.items.reduce((s, x) => s + x.price * x.qty, 0)
  let discountAmount = Math.min(input.manualDiscount || 0, subtotal)
  let fee = input.deliveryFee
  let discountNote: string | undefined
  if (input.discount) {
    const r = applyDiscount(input.discount, input.items, products, fee)
    discountNote = r.reason
    discountAmount += r.amount
    if (r.freeDelivery) fee = 0
  }
  discountAmount = Math.min(discountAmount, subtotal)
  const beforeGift = subtotal - discountAmount + fee
  const giftCardAmount = input.giftCard ? Math.min(input.giftCard.balance, beforeGift) : 0
  return { subtotal, discountAmount, deliveryFee: fee, giftCardAmount, total: beforeGift - giftCardAmount, discountNote }
}

export function createOrder(d: StoreData, input: NewOrderInput, preset?: { id: string; number: number }): Order {
  const t = computeTotals(input, d.products)
  const now = new Date().toISOString()
  const number = preset?.number ?? nextOrderNumber(d)
  const order: Order = {
    id: preset?.id ?? `${d.store.id}-o${number}-${uid()}`, storeId: d.store.id, number, createdAt: now,
    customerId: input.customerId, customerName: input.customerName, phone: input.phone, email: input.email, address: input.address,
    channel: input.channel, items: input.items, subtotal: t.subtotal,
    discountCode: input.discount?.code || (input.discount ? input.discount.title : null), discountAmount: t.discountAmount,
    giftCardCode: input.giftCard?.code ?? null, giftCardAmount: t.giftCardAmount,
    service: input.service ?? (input.deliveryMethod === 'Store pickup' ? 'pickup' : 'delivery'),
    deliveryMethod: input.deliveryMethod, deliveryFee: t.deliveryFee, serviceCharge: input.serviceCharge ?? 0, tip: input.tip ?? 0, tax: 0,
    total: t.total + t.giftCardAmount + (input.serviceCharge ?? 0) + (input.tip ?? 0),
    paymentMethod: input.paymentMethod, paymentStatus: input.paid || t.total === 0 ? 'paid' : 'pending', refunded: 0,
    fulfilmentStatus: 'unfulfilled', deliveryStatus: 'none', kitchenStatus: input.kitchen ? 'new' : null, tableId: input.tableId ?? null,
    carrier: '', tracking: '', tags: input.tags, note: input.note, staff: input.staff, staffId: input.staffId ?? null, shiftId: input.shiftId ?? null,
    timeline: [{ at: now, text: `Order created by ${input.staff} (${CHANNEL_LABEL[input.channel]})`, by: input.staff }],
  }
  if (order.paymentStatus === 'paid') order.timeline.push({ at: now, text: `Payment of ${money0(t.total)} recorded (${METHOD_LABEL[input.paymentMethod]})` })
  if (input.giftCard && t.giftCardAmount) {
    const g = d.giftCards.find(x => x.id === input.giftCard!.id)
    if (g) g.balance -= t.giftCardAmount
    order.timeline.push({ at: now, text: `${money0(t.giftCardAmount)} paid with gift card ${input.giftCard.code}` })
  }
  if (input.discount) { const x = d.discounts.find(y => y.id === input.discount!.id); if (x) x.uses++ }
  adjustStock(d, input.items, -1)
  d.orders.unshift(order)
  if (input.channel !== 'pos') d.notifications.unshift({ id: uid('n'), at: now, text: `Order #${number} created for ${input.customerName || 'a walk-in customer'}`, link: `/orders/${order.id}`, read: true })
  return order
}

// ---------- products ----------
/** Builds every combination of option values, keeping existing variants' prices and stock. */
export function generateVariants(options: Product['options'], existing: Variant[], basePrice: number, skuPrefix: string): Variant[] {
  const clean = options.filter(o => o.name.trim() && o.values.some(v => v.trim())).map(o => ({ ...o, values: o.values.filter(v => v.trim()) }))
  if (!clean.length) {
    const v = existing[0]
    return [{ id: v?.id ?? uid('v'), title: 'Default', options: [], sku: v?.sku ?? '', price: v?.price ?? basePrice, compareAt: v?.compareAt ?? null, cost: v?.cost ?? null, stock: v?.stock ?? 0, trackStock: v?.trackStock ?? true }]
  }
  let combos: string[][] = [[]]
  for (const o of clean) combos = combos.flatMap(c => o.values.map(v => [...c, v]))
  return combos.map((c, i) => {
    const title = c.join(' / ')
    const old = existing.find(v => v.title === title)
    return old ?? { id: uid('v'), title, options: c, sku: skuPrefix ? `${skuPrefix}-${i + 1}` : '', price: basePrice, compareAt: null, cost: null, stock: 0, trackStock: true }
  })
}

export function blankProduct(storeId: string): Product {
  const now = new Date().toISOString()
  return {
    id: '', storeId, title: '', description: '', status: 'draft', images: [], hue: Math.floor(Math.random() * 360), category: '', productType: '', vendor: '',
    tags: [], collectionIds: [], options: [], modifiers: [], variants: [{ id: uid('v'), title: 'Default', options: [], sku: '', price: 0, compareAt: null, cost: null, stock: 0, trackStock: true }],
    seoTitle: '', seoDescription: '', handle: '', createdAt: now, updatedAt: now,
  }
}

// ---------- CSV mapping ----------
export const productsToRows = (d: StoreData, list: Product[]) => list.flatMap(p => p.variants.map((v, i) => ({
  Handle: p.handle, Title: i === 0 ? p.title : '', Description: i === 0 ? p.description : '', Status: p.status, Vendor: p.vendor, 'Product type': p.productType, Category: p.category,
  Tags: p.tags.join(', '), Collections: p.collectionIds.map(id => d.collections.find(c => c.id === id)?.title).filter(Boolean).join(', '),
  'Option names': p.options.map(o => o.name).join(' | '), Variant: v.title, SKU: v.sku, Price: v.price, 'Compare-at price': v.compareAt ?? '', 'Cost per item': v.cost ?? '', Stock: v.stock,
})))

/** Accepts our own template or a Shopify product export and turns both into the same shape. */
function normaliseProductRow(r: Record<string, string>): Record<string, string> {
  if (!('Variant Price' in r) && !('Body (HTML)' in r)) return r
  const vals = [r['Option1 Value'], r['Option2 Value'], r['Option3 Value']].filter(v => v && v !== 'Default Title')
  const names = [r['Option1 Name'], r['Option2 Name'], r['Option3 Name']].filter(n => n && n !== 'Title')
  return {
    Handle: r.Handle ?? '', Title: r.Title ?? '', Description: (r['Body (HTML)'] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    Status: (r.Status ?? '').toLowerCase(), Vendor: r.Vendor ?? '', 'Product type': r.Type ?? '', Category: (r['Product Category'] ?? '').split('>').pop()?.trim() ?? '',
    Tags: r.Tags ?? '', Collections: '', 'Option names': names.join(' | '), Variant: vals.length ? vals.join(' / ') : (r['Variant Price'] ? 'Default' : ''),
    SKU: r['Variant SKU'] ?? '', Price: r['Variant Price'] ?? '', 'Compare-at price': r['Variant Compare At Price'] ?? '', 'Cost per item': r['Cost per item'] ?? '',
    Stock: r['Variant Inventory Qty'] ?? '', Image: r['Image Src'] ?? '',
  }
}

export function rowsToProducts(d: StoreData, rawRows: Record<string, string>[]): { created: number; updated: number } {
  const rows = rawRows.map(normaliseProductRow)
  const byHandle = new Map<string, Record<string, string>[]>()
  for (const r of rows) {
    const h = r.Handle || slug(r.Title || '')
    if (!h) continue
    byHandle.set(h, [...(byHandle.get(h) ?? []), r])
  }
  let created = 0, updated = 0
  for (const [handle, rs] of byHandle) {
    const head = rs.find(r => r.Title) ?? rs[0]
    let p = d.products.find(x => x.handle === handle)
    const isNew = !p
    if (!p) { p = { ...blankProduct(d.store.id), id: uid('p'), handle }; d.products.unshift(p) }
    if (head.Title) p.title = head.Title
    if (head.Description) p.description = head.Description
    if (['active', 'draft', 'archived'].includes(head.Status)) p.status = head.Status as Product['status']
    if (head.Vendor) p.vendor = head.Vendor
    if (head['Product type']) p.productType = head['Product type']
    if (head.Category) p.category = head.Category
    if (head.Tags) p.tags = head.Tags.split(',').map(s => s.trim()).filter(Boolean)
    if (head.Collections) {
      p.collectionIds = head.Collections.split(',').map(s => s.trim()).filter(Boolean).map(name => {
        let c = d.collections.find(x => x.title.toLowerCase() === name.toLowerCase())
        if (!c) { c = { id: uid('c'), storeId: d.store.id, title: name, description: '', visible: true, handle: slug(name) }; d.collections.push(c) }
        return c.id
      })
    }
    const names = (head['Option names'] || '').split('|').map(s => s.trim()).filter(Boolean)
    const imgs = rs.map(r => r.Image).filter(Boolean)
    if (imgs.length) p.images = [...new Set([...p.images, ...imgs])]
    const variantRows = rs.filter(r => r.Variant || r.Price || r.SKU)
    const variants: Variant[] = (variantRows.length ? variantRows : [rs[0]]).map(r => {
      const title = r.Variant || 'Default'
      const old = p!.variants.find(v => v.title === title)
      const num = (s: string) => (s === '' || s == null ? null : Number(s))
      return {
        id: old?.id ?? uid('v'), title, options: title === 'Default' ? [] : title.split('/').map(s => s.trim()),
        sku: r.SKU ?? old?.sku ?? '', price: num(r.Price) ?? old?.price ?? 0, compareAt: num(r['Compare-at price']), cost: num(r['Cost per item']),
        stock: num(r.Stock) ?? old?.stock ?? 0, trackStock: true,
      }
    })
    p.variants = variants
    p.options = names.map((n, i) => ({ name: n, values: [...new Set(variants.map(v => v.options[i]).filter(Boolean))] }))
    p.seoTitle ||= `${p.title} | ${d.store.name}`
    p.updatedAt = new Date().toISOString()
    isNew ? created++ : updated++
  }
  return { created, updated }
}

export const ordersToRows = (list: Order[]) => list.map(o => ({
  Order: '#' + o.number, Date: o.createdAt, Customer: o.customerName, Phone: o.phone, Email: o.email, Channel: CHANNEL_LABEL[o.channel],
  Items: o.items.map(i => `${i.qty}x ${i.title} (${i.variantTitle})`).join('; '), Subtotal: o.subtotal, Discount: o.discountAmount, 'Discount code': o.discountCode ?? '',
  Delivery: o.deliveryFee, 'Delivery method': o.deliveryMethod, Total: o.total, Refunded: o.refunded, 'Payment method': METHOD_LABEL[o.paymentMethod],
  'Payment status': PAYMENT_LABEL[o.paymentStatus], Fulfilment: o.fulfilmentStatus, 'Delivery status': DELIVERY_LABEL[o.deliveryStatus], Tracking: o.tracking, Tags: o.tags.join(', '),
}))

export const customersToRows = (d: StoreData, list: Customer[]) => {
  const st = customerStats(d)
  return list.map(c => ({
    'First name': c.firstName, 'Last name': c.lastName, Email: c.email, Phone: c.phone, Address: c.address.line1, City: c.address.city, Region: c.address.region, Country: c.address.country,
    'Accepts email': c.acceptsEmail ? 'yes' : 'no', 'Accepts WhatsApp': c.acceptsWhatsApp ? 'yes' : 'no', Tags: c.tags.join(', '), Note: c.note,
    Orders: st.get(c.id)?.orders ?? 0, 'Total spent': st.get(c.id)?.spent ?? 0,
  }))
}

export function rowsToCustomers(d: StoreData, rows: Record<string, string>[]) {
  let created = 0, updated = 0
  const yes = (s: string) => /^(y|yes|true|1)$/i.test(s || '')
  for (const r of rows) {
    const email = (r.Email || '').toLowerCase(), phone = r.Phone || ''
    if (!email && !phone && !r['First name']) continue
    let c = d.customers.find(x => (email && x.email.toLowerCase() === email) || (phone && x.phone.replace(/\s/g, '') === phone.replace(/\s/g, '')))
    const isNew = !c
    if (!c) { c = { id: uid('cu'), storeId: d.store.id, firstName: '', lastName: '', email: '', phone: '', address: { line1: '', city: '', region: '', country: 'Ghana' }, acceptsEmail: false, acceptsWhatsApp: false, tags: [], note: '', createdAt: new Date().toISOString() }; d.customers.unshift(c) }
    c.firstName = r['First name'] || c.firstName; c.lastName = r['Last name'] || c.lastName
    c.email = r.Email || c.email; c.phone = r.Phone || c.phone
    c.address = { line1: r.Address || c.address.line1, city: r.City || c.address.city, region: r.Region || c.address.region, country: r.Country || c.address.country || 'Ghana' }
    if (r['Accepts email']) c.acceptsEmail = yes(r['Accepts email'])
    if (r['Accepts WhatsApp']) c.acceptsWhatsApp = yes(r['Accepts WhatsApp'])
    if (r.Tags) c.tags = r.Tags.split(',').map(s => s.trim()).filter(Boolean)
    if (r.Note) c.note = r.Note
    isNew ? created++ : updated++
  }
  return { created, updated }
}
