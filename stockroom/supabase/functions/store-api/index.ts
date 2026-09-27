// Stockroom public API used by client websites (Framer store kit) and WhatsApp.
// Routes:
//   POST /store-api/checkout          create a checkout, returns a payment link (or an order for cash on delivery)
//   GET  /store-api/confirm?ref=…     after payment, checks with the provider and turns the checkout into an order
//   POST /store-api/paystack-webhook  Paystack calls this when a payment succeeds
//   POST /store-api/quote             prices a cart (discounts, delivery, gift card) without creating anything
// Prices, stock and discounts are always worked out here on the server, never trusted from the browser.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (message: string, status = 400) => json({ error: message }, status)

const db = (): SupabaseClient => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

interface CartLine { variantId: string; qty: number; modifiers?: string[]; note?: string }
interface CheckoutInput {
  storeId: string
  items: CartLine[]
  customer: { name: string; phone: string; email?: string }
  address?: { line1?: string; city?: string; region?: string }
  deliveryZoneId?: string | null
  service?: 'delivery' | 'pickup' | 'dine_in' | 'takeaway'
  discountCode?: string
  giftCardCode?: string
  paymentMethod: 'paystack' | 'flutterwave' | 'stripe' | 'cod'
  note?: string
  returnUrl?: string
  channel?: 'online' | 'whatsapp'
}

const today = () => new Date().toISOString().slice(0, 10)
const round2 = (n: number) => Math.round(n * 100) / 100
const digits = (s: string) => (s || '').replace(/\D/g, '')

// ------------------------------------------------------------------ pricing
async function priceCart(sb: SupabaseClient, input: CheckoutInput) {
  if (!input.storeId) throw new Error('Missing store')
  if (!Array.isArray(input.items) || !input.items.length) throw new Error('Your cart is empty')
  const { data: store } = await sb.from('stores').select('*').eq('id', input.storeId).single()
  if (!store) throw new Error('Store not found')

  const ids = input.items.map(i => i.variantId)
  const { data: variants } = await sb.from('product_variants').select('*, products!inner(id, title, status, images, hue, collection_ids, modifiers)').in('id', ids).eq('store_id', store.id)
  const lines: Row[] = []
  for (const it of input.items) {
    const v = (variants ?? []).find((x: Row) => x.id === it.variantId)
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1))
    if (!v || v.products.status !== 'active') throw new Error('One of the items is no longer available')
    if (v.track_stock && v.stock < qty) throw new Error(`Only ${v.stock} left of ${v.products.title}${v.title !== 'Default' ? ` (${v.title})` : ''}`)
    const chosen: { name: string; price: number }[] = []
    for (const name of it.modifiers ?? []) {
      const opt = (v.products.modifiers ?? []).flatMap((g: Row) => g.choices ?? []).find((c: Row) => c.name === name)
      if (opt) chosen.push({ name: opt.name, price: Number(opt.price) || 0 })
    }
    const unit = Number(v.price) + chosen.reduce((s, c) => s + c.price, 0)
    lines.push({ productId: v.product_id, variantId: v.id, title: v.products.title, variantTitle: v.title, price: unit, qty, hue: v.products.hue, image: v.products.images?.[0], modifiers: chosen, note: it.note ?? '', collectionIds: v.products.collection_ids ?? [] })
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0))

  // delivery
  let deliveryMethod = 'Store pickup', deliveryFee = 0
  const service = input.service ?? (input.deliveryZoneId ? 'delivery' : 'pickup')
  if (service === 'delivery') {
    const { data: zone } = await sb.from('delivery_zones').select('*').eq('id', input.deliveryZoneId ?? '').eq('store_id', store.id).eq('active', true).maybeSingle()
    if (!zone) throw new Error('Choose where to deliver to')
    deliveryMethod = zone.name; deliveryFee = Number(zone.fee)
    if (store.free_delivery_over != null && subtotal >= Number(store.free_delivery_over)) deliveryFee = 0
  }

  // discount
  let discountAmount = 0, discountCode: string | null = null, discountId: string | null = null, discountNote = ''
  const phone = digits(input.customer?.phone ?? '')
  const pastOrders = phone ? (await sb.from('orders').select('id, discount_code, phone').eq('store_id', store.id).neq('fulfilment_status', 'cancelled')).data?.filter((o: Row) => digits(o.phone).endsWith(phone.slice(-9))) ?? [] : []
  const candidates: Row[] = []
  if (input.discountCode?.trim()) {
    const { data: d } = await sb.from('discounts').select('*').eq('store_id', store.id).eq('method', 'code').ilike('code', input.discountCode.trim()).maybeSingle()
    if (!d) throw new Error('That discount code doesn’t exist')
    candidates.push(d)
  }
  const { data: autos } = await sb.from('discounts').select('*').eq('store_id', store.id).eq('method', 'automatic').eq('paused', false)
  candidates.push(...(autos ?? []))
  let best = { amount: 0, free: false, d: null as Row | null }
  for (const d of candidates) {
    const why = (() => {
      if (d.paused) return 'This code is paused'
      if (d.starts_at > today()) return 'This code isn’t active yet'
      if (d.ends_at && d.ends_at < today()) return 'This code has expired'
      if (d.usage_limit && d.uses >= d.usage_limit) return 'This code has been fully used'
      if (d.min_spend && subtotal < Number(d.min_spend)) return `Spend at least ${store.currency} ${d.min_spend} to use this code`
      if (d.eligibility === 'first_order' && pastOrders.length) return 'This code is for first orders only'
      if (d.once_per_customer && d.code && pastOrders.some((o: Row) => (o.discount_code ?? '').toUpperCase() === d.code.toUpperCase())) return 'You’ve already used this code'
      return ''
    })()
    if (why) { if (d.method === 'code') discountNote = why; continue }
    const scoped = lines.filter(l => d.applies_to === 'all' || l.collectionIds.includes(d.applies_to))
    const scopedTotal = scoped.reduce((s, l) => s + l.price * l.qty, 0)
    let amount = 0, free = false
    if (d.type === 'percent') amount = round2(scopedTotal * Number(d.value) / 100)
    else if (d.type === 'fixed') amount = Math.min(Number(d.value), scopedTotal)
    else if (d.type === 'free_delivery') free = deliveryFee > 0
    else if (d.type === 'buy_x_get_y') {
      const units = scoped.flatMap(l => Array(l.qty).fill(l.price) as number[]).sort((a, b) => a - b)
      const groups = Math.floor(units.length / (d.buy_qty + d.get_qty))
      amount = units.slice(0, groups * d.get_qty).reduce((s, x) => s + x, 0)
    }
    const value = amount + (free ? deliveryFee : 0)
    if (value > best.amount + (best.free ? deliveryFee : 0)) best = { amount, free, d }
    else if (d.method === 'code' && !value) discountNote = 'Your cart doesn’t qualify for this code'
  }
  if (best.d) { discountAmount = Math.min(best.amount, subtotal); discountCode = best.d.code || best.d.title; discountId = best.d.id; if (best.free) deliveryFee = 0; discountNote = '' }

  // cash on delivery
  const { data: pay } = await sb.from('payment_settings').select('*').eq('store_id', store.id)
  const method = (pay ?? []).find((p: Row) => p.provider === input.paymentMethod)
  if (!method?.enabled) throw new Error('That payment option isn’t available')
  let codFee = 0
  if (input.paymentMethod === 'cod') {
    if (service === 'delivery' && method.cod_zones?.length && !method.cod_zones.includes(deliveryMethod)) throw new Error(`Cash on delivery isn’t available for ${deliveryMethod}`)
    codFee = Number(method.cod_fee) || 0
  }

  // gift card
  const beforeGift = round2(subtotal - discountAmount + deliveryFee + codFee)
  let giftCardAmount = 0, giftCard: Row | null = null
  if (input.giftCardCode?.trim()) {
    const { data: g } = await sb.from('gift_cards').select('*').eq('store_id', store.id).ilike('code', input.giftCardCode.trim()).maybeSingle()
    if (!g || g.disabled || Number(g.balance) <= 0 || (g.expires_at && g.expires_at < today())) throw new Error('That gift card isn’t valid or has no balance left')
    giftCard = g; giftCardAmount = Math.min(Number(g.balance), beforeGift)
  }
  return {
    store, lines: lines.map(({ collectionIds: _c, ...l }) => l), subtotal, discountAmount, discountCode, discountId, discountNote,
    deliveryMethod, deliveryFee: deliveryFee + codFee, service, giftCard, giftCardAmount, total: beforeGift, due: round2(beforeGift - giftCardAmount), provider: method, testMode: method.test_mode,
  }
}

// ------------------------------------------------------------------ orders
async function findOrCreateCustomer(sb: SupabaseClient, storeId: string, c: CheckoutInput['customer'], address: Row, channel: string) {
  const phone = digits(c.phone)
  const { data: list } = await sb.from('customers').select('*').eq('store_id', storeId)
  const hit = (list ?? []).find((x: Row) => (phone && digits(x.phone).slice(-9) === phone.slice(-9)) || (c.email && x.email?.toLowerCase() === c.email.toLowerCase()))
  if (hit) return hit
  const [first, ...rest] = (c.name || '').trim().split(/\s+/)
  const { data } = await sb.from('customers').insert({ store_id: storeId, first_name: first ?? '', last_name: rest.join(' '), phone: c.phone, email: c.email ?? '', address, accepts_whatsapp: channel === 'whatsapp' }).select().single()
  return data
}

async function createOrder(sb: SupabaseClient, input: CheckoutInput, q: Awaited<ReturnType<typeof priceCart>>, paid: boolean, reference: string | null) {
  const store = q.store
  const address = { line1: input.address?.line1 ?? '', city: input.address?.city ?? '', region: input.address?.region ?? '', country: 'Ghana' }
  const customer = await findOrCreateCustomer(sb, store.id, input.customer, address, input.channel ?? 'online')
  const { data: number, error: ne } = await sb.rpc('next_order_number', { sid: store.id })
  if (ne) throw ne
  const now = new Date().toISOString()
  const methodLabel = input.paymentMethod === 'cod' ? 'cash' : input.paymentMethod === 'paystack' ? 'paystack_momo' : input.paymentMethod
  const timeline = [{ at: now, text: input.channel === 'whatsapp' ? 'Order placed through WhatsApp' : 'Order placed on website' }]
  if (paid) timeline.push({ at: now, text: `Payment of ${store.currency} ${q.due.toFixed(2)} confirmed (${input.paymentMethod})` })
  if (q.giftCardAmount) timeline.push({ at: now, text: `${store.currency} ${q.giftCardAmount.toFixed(2)} paid with gift card ${q.giftCard!.code}` })
  const order = {
    store_id: store.id, number, customer_id: customer?.id ?? null, customer_name: input.customer.name, phone: input.customer.phone, email: input.customer.email ?? '', address,
    channel: input.channel ?? 'online', service: q.service, items: q.lines, subtotal: q.subtotal, discount_code: q.discountCode, discount_amount: q.discountAmount,
    gift_card_code: q.giftCard?.code ?? null, gift_card_amount: q.giftCardAmount, delivery_method: q.deliveryMethod, delivery_fee: q.deliveryFee, total: q.total,
    payment_method: methodLabel, payment_status: paid || q.due === 0 ? 'paid' : 'pending', payment_reference: reference, note: input.note ?? '', timeline,
    kitchen_status: store.business_type === 'restaurant' ? 'new' : null,
  }
  const { data: created, error } = await sb.from('orders').insert(order).select('id, number, total').single()
  if (error) throw error
  // stock, discount use, gift card balance
  for (const l of q.lines) {
    const { data: v } = await sb.from('product_variants').select('stock, track_stock').eq('id', l.variantId).single()
    if (v?.track_stock) await sb.from('product_variants').update({ stock: Math.max(0, v.stock - l.qty) }).eq('id', l.variantId)
  }
  if (q.discountId) { const { data: d } = await sb.from('discounts').select('uses').eq('id', q.discountId).single(); await sb.from('discounts').update({ uses: (d?.uses ?? 0) + 1 }).eq('id', q.discountId) }
  if (q.giftCard && q.giftCardAmount) await sb.from('gift_cards').update({ balance: round2(Number(q.giftCard.balance) - q.giftCardAmount) }).eq('id', q.giftCard.id)
  await sb.from('notifications').insert({ store_id: store.id, text: `New order #${created.number} from ${input.customer.name || 'a customer'}`, link: `/orders/${created.id}` })
  return created
}

// ------------------------------------------------------------------ payment providers
async function secret(sb: SupabaseClient, storeId: string, key: string) {
  const { data } = await sb.from('store_secrets').select('value').eq('store_id', storeId).eq('key', key).maybeSingle()
  if (!data) throw new Error('This store hasn’t finished setting up online payments')
  return data.value as string
}

async function startPayment(sb: SupabaseClient, provider: string, checkoutId: string, q: Awaited<ReturnType<typeof priceCart>>, input: CheckoutInput) {
  const cur = q.store.currency as string
  const email = input.customer.email?.includes('@') ? input.customer.email : `${digits(input.customer.phone) || 'customer'}@customers.stockroom.shop`
  const back = (input.returnUrl || `https://${q.store.domain}`)
  const sep = back.includes('?') ? '&' : '?'
  if (provider === 'paystack') {
    const key = await secret(sb, q.store.id, 'paystack_secret')
    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount: Math.round(q.due * 100), currency: cur, reference: checkoutId, callback_url: `${back}${sep}stockroom_ref=${checkoutId}`, metadata: { store_id: q.store.id, phone: input.customer.phone, name: input.customer.name } }),
    }).then(r => r.json())
    if (!r.status) throw new Error(r.message || 'Paystack could not start the payment')
    return r.data.authorization_url as string
  }
  if (provider === 'flutterwave') {
    const key = await secret(sb, q.store.id, 'flutterwave_secret')
    const r = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_ref: checkoutId, amount: q.due, currency: cur, redirect_url: `${back}${sep}stockroom_ref=${checkoutId}`, customer: { email, phonenumber: input.customer.phone, name: input.customer.name }, customizations: { title: q.store.name } }),
    }).then(r => r.json())
    if (r.status !== 'success') throw new Error(r.message || 'Flutterwave could not start the payment')
    return r.data.link as string
  }
  if (provider === 'stripe') {
    const key = await secret(sb, q.store.id, 'stripe_secret')
    const form = new URLSearchParams({
      mode: 'payment', client_reference_id: checkoutId, customer_email: email,
      success_url: `${back}${sep}stockroom_ref=${checkoutId}`, cancel_url: back,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': cur.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(Math.round(q.due * 100)), 'line_items[0][price_data][product_data][name]': `${q.store.name} order`,
      'metadata[checkout_id]': checkoutId,
    })
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form }).then(r => r.json())
    if (r.error) throw new Error(r.error.message)
    await sb.from('abandoned_checkouts').update({ payload: { ...(await sb.from('abandoned_checkouts').select('payload').eq('id', checkoutId).single()).data!.payload, stripe_session: r.id } }).eq('id', checkoutId)
    return r.url as string
  }
  throw new Error('Unknown payment method')
}

async function isPaid(sb: SupabaseClient, checkout: Row): Promise<{ paid: boolean; amount: number; ref: string }> {
  const sid = checkout.store_id
  if (checkout.provider === 'paystack') {
    const key = await secret(sb, sid, 'paystack_secret')
    const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(checkout.id)}`, { headers: { Authorization: `Bearer ${key}` } }).then(r => r.json())
    return { paid: r.status && r.data?.status === 'success', amount: (r.data?.amount ?? 0) / 100, ref: String(r.data?.reference ?? checkout.id) }
  }
  if (checkout.provider === 'flutterwave') {
    const key = await secret(sb, sid, 'flutterwave_secret')
    const r = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(checkout.id)}`, { headers: { Authorization: `Bearer ${key}` } }).then(r => r.json())
    return { paid: r.status === 'success' && r.data?.status === 'successful', amount: Number(r.data?.amount ?? 0), ref: String(r.data?.flw_ref ?? checkout.id) }
  }
  if (checkout.provider === 'stripe') {
    const key = await secret(sb, sid, 'stripe_secret')
    const session = checkout.payload?.stripe_session
    if (!session) return { paid: false, amount: 0, ref: '' }
    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session}`, { headers: { Authorization: `Bearer ${key}` } }).then(r => r.json())
    return { paid: r.payment_status === 'paid', amount: (r.amount_total ?? 0) / 100, ref: String(r.payment_intent ?? session) }
  }
  return { paid: false, amount: 0, ref: '' }
}

/** Turns a paid checkout into an order. Safe to call more than once. */
async function complete(sb: SupabaseClient, checkoutId: string) {
  const { data: c } = await sb.from('abandoned_checkouts').select('*').eq('id', checkoutId).maybeSingle()
  if (!c) throw new Error('Checkout not found')
  if (c.completed && c.order_id) { const { data: o } = await sb.from('orders').select('id, number, total').eq('id', c.order_id).single(); return { order: o, paid: true } }
  const v = await isPaid(sb, c)
  if (!v.paid) return { order: null, paid: false }
  // claim it so two calls at the same moment can't both create an order
  const { data: claimed } = await sb.from('abandoned_checkouts').update({ completed: true }).eq('id', c.id).eq('completed', false).select('id')
  if (!claimed?.length) { await new Promise(r => setTimeout(r, 1500)); return complete(sb, checkoutId) }
  const input = c.payload.input as CheckoutInput
  const { data: store } = await sb.from('stores').select('*').eq('id', c.store_id).single()
  const q = { ...c.payload.quote, store } // exactly what the customer saw and paid for
  if (v.amount + 0.01 < Number(q.due)) {
    await sb.from('abandoned_checkouts').update({ completed: false }).eq('id', c.id)
    throw new Error('The amount paid doesn’t match the order total. Please contact the store.')
  }
  const order = await createOrder(sb, input, q, true, v.ref)
  await sb.from('abandoned_checkouts').update({ order_id: order.id, recovered: true }).eq('id', c.id)
  return { order, paid: true }
}

async function hmacHex(key: string, body: string, hash: 'SHA-512' | 'SHA-256') {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ------------------------------------------------------------------ router
export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  const route = url.pathname.split('/').filter(Boolean).pop()
  const sb = db()
  try {
    if (route === 'quote' && req.method === 'POST') {
      const input = await req.json() as CheckoutInput
      const q = await priceCart(sb, { ...input, paymentMethod: input.paymentMethod ?? 'cod' }).catch(async e => {
        if (String(e.message).includes('payment option')) return priceCart(sb, { ...input, paymentMethod: 'paystack' })
        throw e
      })
      return json({ lines: q.lines, subtotal: q.subtotal, discountAmount: q.discountAmount, discountCode: q.discountCode, discountNote: q.discountNote, deliveryMethod: q.deliveryMethod, deliveryFee: q.deliveryFee, giftCardAmount: q.giftCardAmount, total: q.total, due: q.due, currency: q.store.currency })
    }

    if (route === 'checkout' && req.method === 'POST') {
      const input = await req.json() as CheckoutInput
      if (!input.customer?.name?.trim() || digits(input.customer?.phone).length < 9) return fail('Please enter your name and a phone number')
      const q = await priceCart(sb, input)
      if (input.paymentMethod === 'cod' || q.due === 0) {
        const order = await createOrder(sb, input, q, q.due === 0, null)
        return json({ orderId: order.id, number: order.number, total: order.total, paid: q.due === 0 })
      }
      const { data: c, error } = await sb.from('abandoned_checkouts').insert({
        store_id: q.store.id, customer_name: input.customer.name, phone: input.customer.phone, email: input.customer.email ?? '', items: q.lines, total: q.due,
        provider: input.paymentMethod, payload: { input, quote: { ...q, store: undefined, provider: undefined } },
      }).select('id').single()
      if (error) throw error
      try {
        const payUrl = await startPayment(sb, input.paymentMethod, c.id, q, input)
        return json({ checkoutId: c.id, payUrl, due: q.due })
      } catch (e) {
        await sb.from('abandoned_checkouts').delete().eq('id', c.id)
        throw e
      }
    }

    if (route === 'confirm') {
      const ref = url.searchParams.get('ref') ?? (req.method === 'POST' ? (await req.json()).ref : '')
      if (!ref) return fail('Missing reference')
      const r = await complete(sb, ref)
      return json(r.order ? { paid: true, orderId: r.order.id, number: r.order.number, total: r.order.total } : { paid: false })
    }

    if (route === 'paystack-webhook' && req.method === 'POST') {
      const raw = await req.text()
      const event = JSON.parse(raw)
      const ref = event?.data?.reference
      const { data: c } = await sb.from('abandoned_checkouts').select('id, store_id').eq('id', ref).maybeSingle()
      if (!c) return json({ ok: true }) // not one of ours
      const key = await secret(sb, c.store_id, 'paystack_secret')
      if (await hmacHex(key, raw, 'SHA-512') !== req.headers.get('x-paystack-signature')) return fail('Bad signature', 401)
      if (event.event === 'charge.success') await complete(sb, c.id)
      return json({ ok: true })
    }

    if (route === 'order' && req.method === 'GET') {
      const { data } = await sb.rpc('get_order_status', { oid: url.searchParams.get('id') })
      return data ? json(data) : fail('Order not found', 404)
    }

    return fail('Not found', 404)
  } catch (e) {
    return fail((e as Error).message || 'Something went wrong')
  }
}

Deno.serve(handle)
