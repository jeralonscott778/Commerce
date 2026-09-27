// WhatsApp ordering bot for Stockroom stores (Meta WhatsApp Cloud API).
//   GET  /whatsapp/<storeId>   Meta checks the webhook (verify token)
//   POST /whatsapp/<storeId>   Meta delivers incoming messages; the bot replies
//   POST /whatsapp/send        a signed-in team member replies from the dashboard
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const URL_BASE = Deno.env.get('SUPABASE_URL')!
const db = (): SupabaseClient => createClient(URL_BASE, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

interface Cart { variantId: string; title: string; price: number; qty: number }
interface State { step?: string; cart?: Cart[]; service?: 'pickup' | 'delivery'; zoneId?: string; address?: string; name?: string; lastOrder?: number }

const money = (cur: string, n: number) => `${cur === 'GHS' ? 'GH₵' : cur + ' '}${n.toFixed(2).replace(/\.00$/, '')}`

async function secret(sb: SupabaseClient, sid: string, key: string) {
  const { data } = await sb.from('store_secrets').select('value').eq('store_id', sid).eq('key', key).maybeSingle()
  return (data?.value as string) ?? ''
}

async function send(sb: SupabaseClient, store: Row, conv: Row, body: string) {
  const cfg = store.settings?.whatsapp ?? {}
  const token = await secret(sb, store.id, 'whatsapp_token')
  await sb.from('wa_messages').insert({ store_id: store.id, conversation_id: conv.id, direction: 'out', body })
  await sb.from('wa_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id)
  if (!token || !cfg.phoneNumberId) return { ok: false, error: 'WhatsApp is not connected yet' }
  const r = await fetch(`https://graph.facebook.com/${cfg.apiVersion || 'v23.0'}/${cfg.phoneNumberId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: conv.phone, type: 'text', text: { body: body.slice(0, 4000), preview_url: true } }),
  })
  if (!r.ok) { const e = await r.text(); console.error('WhatsApp send failed', e); return { ok: false, error: e } }
  return { ok: true }
}

async function menu(sb: SupabaseClient, sid: string) {
  const { data } = await sb.from('products').select('id, title, product_variants(id, title, price, stock, track_stock, position)').eq('store_id', sid).eq('status', 'active').order('title').limit(40)
  const items: { n: number; variantId: string; title: string; price: number }[] = []
  for (const p of data ?? []) {
    for (const v of (p.product_variants ?? []).sort((a: Row, b: Row) => a.position - b.position)) {
      if (v.track_stock && v.stock <= 0) continue
      items.push({ n: items.length + 1, variantId: v.id, title: v.title === 'Default' ? p.title : `${p.title} (${v.title})`, price: Number(v.price) })
    }
  }
  return items
}

/** Reads things like "2x3", "3 x 2", "2 flat white, 1 banana bread" or "1, 4". */
function parseOrder(text: string, items: Awaited<ReturnType<typeof menu>>): Cart[] {
  const out: Cart[] = []
  const add = (it: (typeof items)[number] | undefined, qty: number) => {
    if (!it || qty <= 0) return
    const ex = out.find(c => c.variantId === it.variantId)
    ex ? (ex.qty += qty) : out.push({ variantId: it.variantId, title: it.title, price: it.price, qty })
  }
  for (const raw of text.toLowerCase().split(/[,\n;]+| and /)) {
    const part = raw.trim(); if (!part) continue
    let m = part.match(/^(\d+)\s*[x×*]\s*(\d+)$/)                 // 2x3 = 2 of item 3
    if (m) { add(items.find(i => i.n === +m![2]), +m[1]); continue }
    m = part.match(/^#?(\d+)$/)                                   // "4" = one of item 4
    if (m) { add(items.find(i => i.n === +m![1]), 1); continue }
    m = part.match(/^(\d+)?\s*[x×]?\s*(.+)$/)                     // "2 flat white"
    if (m) {
      const qty = m[1] ? +m[1] : 1
      const words = m[2].replace(/s\b/g, '').split(/\s+/).filter(w => w.length >= 3)
      if (!words.length) continue
      const titleWords = (i: (typeof items)[number]) => i.title.toLowerCase().split(/[^a-z0-9]+/)
      const hit = items.find(i => words.every(w => titleWords(i).some(tw => tw.startsWith(w))))
      add(hit, qty)
    }
  }
  return out
}

async function bot(sb: SupabaseClient, store: Row, conv: Row, text: string) {
  const cur = store.currency as string
  const cfg = store.settings?.whatsapp ?? {}
  const st: State = conv.state ?? {}
  const t = text.trim().toLowerCase()
  const save = (s: State) => sb.from('wa_conversations').update({ state: s }).eq('id', conv.id)
  const say = (b: string) => send(sb, store, conv, b)

  if (conv.needs_human && !['menu', 'hi', 'hello', 'order'].includes(t)) return // a person is handling this chat
  if (['agent', 'human', 'help', 'person'].includes(t)) {
    await sb.from('wa_conversations').update({ needs_human: true }).eq('id', conv.id)
    await sb.from('notifications').insert({ store_id: store.id, text: `${conv.name || conv.phone} wants to talk to someone on WhatsApp`, link: '/whatsapp' })
    return say('Okay, a member of our team will reply here shortly. 🙏')
  }
  if (/book|reserv|table for/.test(t) && store.business_type === 'restaurant') {
    return say(`To book a table, pick a time here: https://${store.domain}/book\nOr reply AGENT and we’ll help you.`)
  }
  if (cfg.mode === 'link') {
    return say(`${cfg.greeting || `Welcome to ${store.name}!`}\nOrder here and pay with MoMo or card: https://${store.domain}\nReply AGENT to talk to someone.`)
  }

  const items = await menu(sb, store.id)
  const menuText = () => `${cfg.greeting || `Welcome to ${store.name}! 👋`}\nReply with what you want, e.g. *2x1, 1x4* or *2 ${items[0]?.title.toLowerCase() ?? 'items'}*.\n\n${items.map(i => `${i.n}. ${i.title} – ${money(cur, i.price)}`).join('\n')}\n\nReply AGENT to talk to someone.`

  if (!st.step || st.step === 'done' || ['menu', 'hi', 'hello', 'start', 'order', 'cancel'].includes(t)) {
    const greeting = ['menu', 'hi', 'hello', 'hey', 'start', 'order', 'cancel', 'good morning', 'good afternoon', 'good evening'].includes(t)
    const parsed = (st.step && st.step !== 'done') || greeting ? [] : parseOrder(t, items)
    if (!parsed.length) { await save({ step: 'ordering', cart: [] }); return say(menuText()) }
    st.cart = parsed; st.step = 'ordering'
  } else if (st.step === 'ordering') {
    const parsed = parseOrder(t, items)
    if (!parsed.length && !['done', 'yes', 'ok', 'y'].includes(t)) return say('Sorry, I didn’t catch that. Reply with item numbers like *2x1, 1x3*, or MENU to see the list again.')
    for (const p of parsed) { const ex = st.cart?.find(c => c.variantId === p.variantId); ex ? (ex.qty += p.qty) : (st.cart = [...(st.cart ?? []), p]) }
  }

  if (st.step === 'ordering') {
    if (!st.cart?.length) return say(menuText())
    const total = st.cart.reduce((s, c) => s + c.price * c.qty, 0)
    st.step = 'service'; await save(st)
    const { data: zones } = await sb.from('delivery_zones').select('id').eq('store_id', store.id).eq('active', true).neq('fee', 0)
    return say(`Your order:\n${st.cart.map(c => `${c.qty} × ${c.title} – ${money(cur, c.price * c.qty)}`).join('\n')}\n*Total ${money(cur, total)}*\n\nReply *1* for pickup${zones?.length ? ' or *2* for delivery' : ''}. Reply MENU to start again.`)
  }

  if (st.step === 'service') {
    if (t === '1' || t.includes('pick')) { st.service = 'pickup'; st.step = 'name'; await save(st); return say('Great. What name should we put on the order?') }
    if (t === '2' || t.includes('deliver')) {
      const { data: zones } = await sb.from('delivery_zones').select('id, name, fee').eq('store_id', store.id).eq('active', true).neq('fee', 0).order('position')
      st.service = 'delivery'; st.step = 'zone'; await save({ ...st, zones: zones?.map(z => z.id) } as State)
      return say(`Where should we deliver?\n${(zones ?? []).map((z, i) => `${i + 1}. ${z.name} (${money(cur, Number(z.fee))})`).join('\n')}`)
    }
    return say('Reply *1* for pickup or *2* for delivery.')
  }
  if (st.step === 'zone') {
    const ids = (st as State & { zones?: string[] }).zones ?? []
    const pickZone = ids[Number(t) - 1]
    if (!pickZone) return say('Reply with the number of your area.')
    st.zoneId = pickZone; st.step = 'address'; await save(st)
    return say('Send your delivery address or a nearby landmark (e.g. “House 12, behind Shell, Spintex Road”).')
  }
  if (st.step === 'address') { st.address = text.trim(); st.step = 'name'; await save(st); return say('Thanks. What name should we put on the order?') }
  if (st.step === 'name') {
    st.name = text.trim().slice(0, 60); st.step = 'pay'; await save(st)
    const { data: pay } = await sb.from('payment_settings').select('provider, enabled').eq('store_id', store.id).eq('enabled', true)
    const online = pay?.some(p => p.provider !== 'cod'), cod = pay?.some(p => p.provider === 'cod')
    return say(`How would you like to pay?\n${online ? '*1* MoMo or card (we send a secure link)\n' : ''}${cod ? `*2* Cash / MoMo on ${st.service === 'delivery' ? 'delivery' : 'pickup'}` : ''}`)
  }
  if (st.step === 'pay') {
    const online = t === '1' || t.includes('momo') || t.includes('card')
    if (!online && t !== '2' && !t.includes('cash')) return say('Reply *1* to pay now or *2* to pay on delivery/pickup.')
    const { data: pay } = await sb.from('payment_settings').select('provider').eq('store_id', store.id).eq('enabled', true).neq('provider', 'cod')
    const method = online ? (pay?.find(p => p.provider === 'paystack')?.provider ?? pay?.[0]?.provider ?? 'paystack') : 'cod'
    const r = await fetch(`${URL_BASE}/functions/v1/store-api/checkout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: store.id, channel: 'whatsapp', items: st.cart!.map(c => ({ variantId: c.variantId, qty: c.qty })), customer: { name: st.name, phone: '+' + conv.phone }, address: { line1: st.address ?? '' }, service: st.service, deliveryZoneId: st.zoneId ?? null, paymentMethod: method, returnUrl: `https://${store.domain}` }),
    }).then(x => x.json())
    if (r.error) { await save({ step: 'ordering', cart: st.cart }); return say(`Sorry, ${r.error.charAt(0).toLowerCase() + r.error.slice(1)}. Reply MENU to try again or AGENT for help.`) }
    await save({ step: 'done', lastOrder: r.number })
    if (r.payUrl) return say(`Pay ${money(cur, r.due)} here: ${r.payUrl}\nWe’ll start your order as soon as payment goes through. 🙌`)
    return say(`Order *#${r.number}* is confirmed! Total ${money(cur, r.total)}, paid on ${st.service === 'delivery' ? 'delivery' : 'pickup'}. We’ll message you when it’s ready.`)
  }
  await save({ step: 'ordering', cart: [] })
  return say(menuText())
}

async function hmac(key: string, body: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = new URL(req.url)
  const last = url.pathname.split('/').filter(Boolean).pop() ?? ''
  const sb = db()
  try {
    // ---- reply from the dashboard (signed-in team member)
    if (last === 'send' && req.method === 'POST') {
      const jwt = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
      const { data: u } = await sb.auth.getUser(jwt)
      if (!u?.user) return json({ error: 'Sign in again' }, 401)
      const { conversationId, text, handBack } = await req.json()
      const { data: conv } = await sb.from('wa_conversations').select('*').eq('id', conversationId).single()
      const { data: member } = await sb.from('store_members').select('role').eq('store_id', conv?.store_id).eq('user_id', u.user.id).maybeSingle()
      if (!conv || !member) return json({ error: 'Not allowed' }, 403)
      const { data: store } = await sb.from('stores').select('*').eq('id', conv.store_id).single()
      if (handBack) { await sb.from('wa_conversations').update({ needs_human: false, state: {} }).eq('id', conv.id); return json({ ok: true }) }
      const r = await send(sb, store, conv, String(text).slice(0, 4000))
      return json(r)
    }

    // ---- Meta webhook
    const storeId = last
    const { data: store } = await sb.from('stores').select('*').eq('id', storeId).maybeSingle()
    if (!store) return new Response('Unknown store', { status: 404 })
    if (req.method === 'GET') {
      const verify = await secret(sb, store.id, 'whatsapp_verify_token')
      if (url.searchParams.get('hub.mode') === 'subscribe' && verify && url.searchParams.get('hub.verify_token') === verify) return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 })
      return new Response('Forbidden', { status: 403 })
    }
    const raw = await req.text()
    const appSecret = await secret(sb, store.id, 'whatsapp_app_secret')
    if (appSecret && `sha256=${await hmac(appSecret, raw)}` !== req.headers.get('x-hub-signature-256')) return new Response('Bad signature', { status: 401 })
    const body = JSON.parse(raw)
    for (const entry of body.entry ?? []) for (const change of entry.changes ?? []) {
      const v = change.value ?? {}
      const names: Record<string, string> = Object.fromEntries((v.contacts ?? []).map((c: Row) => [c.wa_id, c.profile?.name ?? '']))
      for (const m of v.messages ?? []) {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? (m.type === 'audio' ? '[voice note]' : `[${m.type}]`)
        const { data: conv } = await sb.from('wa_conversations').upsert({ store_id: store.id, phone: m.from, name: names[m.from] ?? '', last_message_at: new Date().toISOString() }, { onConflict: 'store_id,phone' }).select().single()
        await sb.from('wa_messages').insert({ store_id: store.id, conversation_id: conv.id, direction: 'in', body: text })
        if (store.settings?.whatsapp?.enabled === false) continue
        if (m.type === 'audio') { await send(sb, store, conv, 'Thanks for the voice note! Please type your order, or reply AGENT and someone will listen and help.'); continue }
        await bot(sb, store, conv, text)
      }
    }
    return new Response('ok')
  } catch (e) {
    console.error(e)
    return json({ error: (e as Error).message }, 500)
  }
})
