// Sample data for demo stores. Replaced by real data once Supabase is connected.
import type { StoreData, Product, Order, Customer, Channel, PaymentMethod, LineItem, Collection } from './types'
import { addDays, isoDay, slug } from '../lib/util'

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)]

const PEOPLE: [string, string, string][] = [
  ['Ama', 'Owusu', 'Accra'], ['Kwame', 'Mensah', 'Kumasi'], ['Efua', 'Asante', 'Cape Coast'], ['Kofi', 'Boateng', 'Tema'],
  ['Akosua', 'Darko', 'East Legon'], ['Yaw', 'Addo', 'Kumasi'], ['Abena', 'Osei', 'Accra'], ['Nana', 'Agyeman', 'Takoradi'],
  ['Esi', 'Quaye', 'Accra'], ['Kojo', 'Antwi', 'Tamale'], ['Adwoa', 'Frimpong', 'Accra'], ['Selasi', 'Tetteh', 'Ho'],
  ['Dzifa', 'Amegashie', 'Tema'], ['Fiifi', 'Sarpong', 'East Legon'], ['Naa', 'Lamptey', 'Accra'], ['Mawuli', 'Kpodo', 'Ho'],
  ['Afia', 'Boakye', 'Kumasi'], ['Kweku', 'Annan', 'Cape Coast'], ['Edem', 'Agbeko', 'Accra'], ['Maame', 'Yeboah', 'Tema'],
]
const REGION: Record<string, string> = {
  Accra: 'Greater Accra', 'East Legon': 'Greater Accra', Tema: 'Greater Accra', Kumasi: 'Ashanti',
  'Cape Coast': 'Central', Takoradi: 'Western', Tamale: 'Northern', Ho: 'Volta',
}

type P = [title: string, collection: string, price: number, compare: number | null, sizes: string[], colours: string[], hue: number, type: string, desc: string]

const DEFS: Record<string, { name: string; tagline: string; initials: string; accent: string; domain: string; seed: number; start: number; collections: string[]; products: P[]; hero: [string, string, string]; announcement: string }> = {
  finefits: {
    name: 'FineFits', tagline: 'Premium athleisure', initials: 'FF', accent: '#1F5E4B', domain: 'finefits.com.gh', seed: 7, start: 1001,
    collections: ['New in', 'Bottoms', 'Tops', 'Outerwear'],
    hero: ['Built to move with you', 'Studio-to-street pieces in fabrics made for Accra heat.', 'Shop new in'],
    announcement: 'Free delivery in Accra on orders over GH₵500',
    products: [
      ['Contour High-Rise Leggings', 'Bottoms', 420, 480, ['XS', 'S', 'M', 'L', 'XL'], ['Onyx', 'Sage'], 150, 'Leggings', 'Four-way stretch fabric with a sculpting high waistband and a hidden key pocket.'],
      ['Aero Support Sports Bra', 'Tops', 280, null, ['XS', 'S', 'M', 'L'], ['Onyx', 'Clay'], 20, 'Sports bras', 'Medium-support bra with removable cups and a breathable mesh back.'],
      ['Stride Tapered Joggers', 'Bottoms', 390, null, ['S', 'M', 'L', 'XL'], ['Stone'], 95, 'Joggers', 'Brushed-back cotton joggers with a tapered leg and zip pockets.'],
      ['Core Cropped Tee', 'Tops', 210, null, ['XS', 'S', 'M', 'L'], ['Chalk', 'Onyx'], 200, 'T-shirts', 'Soft, boxy cropped tee cut from heavyweight organic cotton.'],
      ['Tempo Running Shorts', 'Bottoms', 240, 280, ['S', 'M', 'L'], ['Onyx'], 260, 'Shorts', 'Lightweight 5-inch shorts with a built-in liner and reflective trim.'],
      ['Loom Oversized Hoodie', 'Outerwear', 520, null, ['S', 'M', 'L', 'XL'], ['Oat'], 35, 'Hoodies', 'Relaxed loopback hoodie with dropped shoulders and a double-layer hood.'],
      ['Studio Rib Tank', 'Tops', 180, null, ['XS', 'S', 'M'], ['Sage', 'Chalk'], 120, 'Tanks', 'Fitted ribbed tank that layers under everything.'],
      ['Pace Packable Windbreaker', 'Outerwear', 650, null, ['S', 'M', 'L'], ['Onyx'], 330, 'Jackets', 'Water-resistant shell that folds into its own chest pocket.'],
    ],
  },
  xanthea: {
    name: 'Xanthea Skin', tagline: 'Cosmeceutical skincare', initials: 'XS', accent: '#6A3D62', domain: 'xantheaskin.com', seed: 19, start: 2201,
    collections: ['Best sellers', 'Serums', 'Moisturisers', 'Cleansers', 'Sun care'],
    hero: ['Skin that behaves.', 'Clinically-backed actives, formulated and tested for melanin-rich skin.', 'Shop serums'],
    announcement: 'Nationwide delivery in 2–5 days. Pay on delivery in Accra and Kumasi.',
    products: [
      ['Niacinamide 10% Clarifying Serum', 'Serums', 185, null, ['30ml'], [], 300, 'Serum', 'Targets blemishes and uneven tone. Suitable for oily and combination skin.'],
      ['Vitamin C Brightening Serum', 'Serums', 260, null, ['30ml'], [], 40, 'Serum', '15% L-ascorbic acid with ferulic acid for glow and dark-spot care.'],
      ['Barrier Repair Cream', 'Moisturisers', 240, null, ['50ml'], [], 170, 'Moisturiser', 'Ceramide-rich cream that calms dryness and supports the skin barrier.'],
      ['Gentle Gel Cleanser', 'Cleansers', 150, null, ['150ml', '300ml'], [], 210, 'Cleanser', 'Low-foam, pH-balanced cleanser that leaves no tight feeling.'],
      ['SPF 50 Daily Fluid', 'Sun care', 210, 240, ['50ml'], [], 50, 'Sunscreen', 'Invisible finish on deeper skin tones. No white cast.'],
      ['Retinal Night Treatment', 'Serums', 295, null, ['30ml'], [], 270, 'Serum', 'Encapsulated retinal for texture and fine lines. Use at night.'],
      ['Hydrating Rose Toner', 'Cleansers', 140, null, ['200ml'], [], 340, 'Toner', 'Alcohol-free toner with rose water and glycerin.'],
    ],
  },
}

export const DEMO_STORES = [...Object.entries(DEFS).map(([id, d]) => ({ id, name: d.name, initials: d.initials, accent: d.accent })), { id: 'osu-cafe', name: 'Osu Coffee House', initials: 'OC', accent: '#8A4B1F' }]

export function buildDemo(storeId: string): StoreData {
  if (storeId === 'osu-cafe') return buildCafe()
  const d = DEFS[storeId]
  const r = rng(d.seed)
  const now = new Date()

  const collections: Collection[] = d.collections.map((t, i) => ({ id: `${storeId}-c${i}`, storeId, title: t, description: '', visible: true, handle: slug(t) }))
  const colId = (t: string) => collections.find(c => c.title === t)!.id

  const products: Product[] = d.products.map((p, i) => {
    const [title, col, price, compare, sizes, colours, hue, type, desc] = p
    const options = [{ name: colours.length ? 'Size' : 'Volume', values: sizes }, ...(colours.length ? [{ name: 'Colour', values: colours }] : [])]
    const combos: string[][] = colours.length ? sizes.flatMap(s => colours.map(c => [s, c])) : sizes.map(s => [s])
    const created = addDays(-60 - Math.floor(r() * 90)).toISOString()
    return {
      id: `${storeId}-p${i}`, storeId, title, description: desc,
      status: i === d.products.length - 1 ? 'draft' : 'active',
      images: [], hue, category: col, productType: type, vendor: d.name,
      tags: [col.toLowerCase()], collectionIds: [colId(col), ...(i < 3 ? [collections[0].id] : [])],
      options, modifiers: [],
      variants: combos.map((o, j) => {
        let stock = Math.floor(r() * 24)
        if (r() < 0.12) stock = Math.floor(r() * 3)
        const extra = o[0] === '300ml' ? 90 : 0
        return { id: `${storeId}-p${i}-v${j}`, title: o.join(' / '), options: o, sku: `${d.initials}-${String(i + 1).padStart(3, '0')}-${j + 1}`, price: price + extra, compareAt: compare ? compare + extra : null, cost: Math.round(price * 0.42), stock, trackStock: true }
      }),
      seoTitle: `${title} | ${d.name}`, seoDescription: desc, handle: slug(title), createdAt: created, updatedAt: addDays(-Math.floor(r() * 20)).toISOString(),
    }
  })

  const customers: Customer[] = PEOPLE.map(([f, l, city], i) => ({
    id: `${storeId}-cu${i}`, storeId, firstName: f, lastName: l,
    email: `${f}.${l}`.toLowerCase() + '@gmail.com',
    phone: `+233 ${pick(r, ['24', '54', '20', '55', '27'])} ${100 + Math.floor(r() * 899)} ${1000 + Math.floor(r() * 8999)}`,
    address: { line1: `${1 + Math.floor(r() * 40)} ${pick(r, ['Oxford St', 'Liberation Rd', 'Spintex Rd', 'Ring Rd', 'Harper Rd', 'Adum St'])}`, city, region: REGION[city], country: 'Ghana' },
    acceptsEmail: r() < 0.55, acceptsWhatsApp: r() < 0.7, tags: r() < 0.15 ? ['VIP'] : [], note: '',
    createdAt: addDays(-100 - Math.floor(r() * 200)).toISOString(),
  }))

  const live = products.filter(p => p.status === 'active')
  const feeFor = (region: string) => (region === 'Greater Accra' ? 30 : region === 'Ashanti' ? 45 : 60)
  const orders: Order[] = []
  for (let i = 0; i < 140; i++) {
    const daysAgo = Math.floor(Math.pow(r(), 1.15) * 90)
    const at = addDays(-daysAgo); at.setHours(7 + Math.floor(r() * 15), Math.floor(r() * 60))
    if (at > now) at.setTime(now.getTime() - Math.floor(r() * 3600000))
    const cu = pick(r, customers)
    const items: LineItem[] = []
    const n = 1 + Math.floor(r() * r() * 3.2)
    for (let k = 0; k < n; k++) {
      const p = pick(r, live), v = pick(r, p.variants)
      items.push({ productId: p.id, variantId: v.id, title: p.title, variantTitle: v.title, price: v.price, qty: r() < 0.8 ? 1 : 2, hue: p.hue })
    }
    const subtotal = items.reduce((s, x) => s + x.price * x.qty, 0)
    let code: string | null = pick(r, ['WELCOME10', 'FREESHIP500', null, null, null, null, null])
    let discount = 0
    let fee = feeFor(cu.address.region)
    let method = cu.address.region === 'Greater Accra' && r() < 0.15 ? 'Store pickup' : cu.address.region
    if (method === 'Store pickup') fee = 0
    if (code === 'WELCOME10') discount = Math.round(subtotal * 0.1)
    if (code === 'FREESHIP500') { if (subtotal >= 500) fee = 0; else code = null }
    const ch: Channel = (() => { const x = r(); return x < 0.62 ? 'online' : x < 0.8 ? 'whatsapp' : x < 0.9 ? 'instagram' : x < 0.96 ? 'phone' : 'walk-in' })()
    const pm: PaymentMethod = (() => { const x = r(); return x < 0.36 ? 'paystack_momo' : x < 0.52 ? 'paystack_card' : x < 0.72 ? 'cash' : x < 0.86 ? 'flutterwave' : 'stripe' })()
    let fs: Order['fulfilmentStatus'] = 'fulfilled'
    let ds: Order['deliveryStatus'] = method === 'Store pickup' ? 'picked_up' : 'delivered'
    if (daysAgo <= 1) { fs = 'unfulfilled'; ds = 'none' }
    else if (daysAgo <= 4) { if (r() < 0.5) { fs = 'fulfilled'; ds = method === 'Store pickup' ? 'picked_up' : 'out_for_delivery' } else { fs = 'unfulfilled'; ds = r() < 0.4 ? 'packed' : 'none' } }
    let ps: Order['paymentStatus'] = pm === 'cash' && ds !== 'delivered' && ds !== 'picked_up' ? 'pending' : 'paid'
    let refunded = 0
    if (r() < 0.04) { fs = 'cancelled'; ds = 'none'; ps = pm === 'cash' ? 'voided' : 'refunded' }
    const total = subtotal - discount + fee
    if (ps === 'refunded') refunded = total
    const carrier = fs === 'fulfilled' && method !== 'Store pickup' ? pick(r, ['Own rider', 'Yango Delivery', 'Bolt Send', 'VIP Bus parcel']) : ''
    const timeline = [{ at: at.toISOString(), text: ch === 'online' ? 'Order placed on website' : ch === 'whatsapp' ? 'Order placed through WhatsApp' : `Order created by staff (${ch})` }]
    if (ps === 'paid' && pm !== 'cash') timeline.push({ at: new Date(+at + 60000).toISOString(), text: 'Payment confirmed' })
    if (fs === 'fulfilled') timeline.push({ at: new Date(+at + 86400000).toISOString(), text: carrier ? `Handed to ${carrier}` : 'Ready for pickup' })
    if (ds === 'delivered' || ds === 'picked_up') timeline.push({ at: new Date(+at + 2 * 86400000).toISOString(), text: ds === 'picked_up' ? 'Picked up by customer' : 'Delivered' })
    if (fs === 'cancelled') timeline.push({ at: new Date(+at + 3600000).toISOString(), text: 'Order cancelled' })
    orders.push({
      id: '', storeId, number: 0, createdAt: at.toISOString(), customerId: cu.id, customerName: `${cu.firstName} ${cu.lastName}`, phone: cu.phone, email: cu.email, address: cu.address,
      channel: ch, service: method === 'Store pickup' ? 'pickup' : 'delivery', items, subtotal, discountCode: code, discountAmount: discount, giftCardCode: null, giftCardAmount: 0, deliveryMethod: method, deliveryFee: fee, serviceCharge: 0, tip: 0, tax: 0, total,
      paymentMethod: pm, paymentStatus: ps, refunded, fulfilmentStatus: fs, deliveryStatus: ds, kitchenStatus: null, tableId: null, carrier, tracking: carrier && carrier !== 'Own rider' ? 'GH' + Math.floor(100000 + r() * 899999) : '',
      tags: r() < 0.1 ? ['gift'] : [], note: r() < 0.1 ? 'Please call before delivery.' : '', staff: ch === 'online' ? null : pick(r, ['Kofi Asare', 'Abena Owusu']), staffId: null, shiftId: null, timeline,
    })
  }
  orders.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
  orders.forEach((o, i) => { o.number = d.start + i; o.id = `${storeId}-o${o.number}` })
  orders.reverse()

  const itemFrom = (p: Product, qty = 1): LineItem => ({ productId: p.id, variantId: p.variants[0].id, title: p.title, variantTitle: p.variants[0].title, price: p.variants[0].price, qty, hue: p.hue })

  return {
    store: {
      id: storeId, name: d.name, tagline: d.tagline, initials: d.initials, accent: d.accent, domain: d.domain,
      email: 'hello@' + d.domain, phone: '+233 24 555 0142', address: storeId === 'finefits' ? '14 Oxford Street, Osu, Accra' : 'Plot 22, Spintex Road, Accra',
      currency: 'GHS', lowStockAt: 5, taxRate: 0, taxIncluded: true, businessType: 'retail',
      storefront: { public: true, password: '', seoTitle: `${d.name} | ${d.tagline}`, seoDescription: d.hero[1], announcement: d.announcement, announcementOn: true, heroTitle: d.hero[0], heroText: d.hero[1], heroButton: d.hero[2], featuredCollectionId: collections[1].id, whatsapp: '+233 24 555 0142', instagram: '@' + slug(d.name).replace(/-/g, '') },
      freeDeliveryOver: storeId === 'finefits' ? 500 : null,
      settings: {},
    },
    products, collections, customers, orders,
    drafts: [
      { id: `${storeId}-d1`, storeId, number: 1, createdAt: addDays(-1).toISOString(), customerId: customers[3].id, customerName: `${customers[3].firstName} ${customers[3].lastName}`, phone: customers[3].phone, items: [itemFrom(live[0], 2)], discountAmount: 0, deliveryMethod: 'Greater Accra', deliveryFee: 30, note: 'Asked on Instagram, waiting for MoMo', channel: 'instagram' },
    ],
    abandoned: [0, 1, 2, 3].map(i => {
      const cu = customers[(i * 5 + 2) % customers.length], p = live[(i * 3) % live.length]
      const items = [itemFrom(p, 1)]
      return { id: `${storeId}-a${i}`, storeId, createdAt: new Date(Date.now() - (i * 20 + 3) * 3600000).toISOString(), customerName: `${cu.firstName} ${cu.lastName}`, phone: cu.phone, email: cu.email, items, total: items[0].price, remindedAt: i === 2 ? new Date(Date.now() - 20 * 3600000).toISOString() : null, recovered: i === 3 }
    }),
    discounts: [
      { id: `${storeId}-ds1`, storeId, method: 'code', code: 'WELCOME10', title: '', type: 'percent', value: 10, buyQty: 2, getQty: 1, appliesTo: 'all', minSpend: 0, eligibility: 'first_order', usageLimit: 0, oncePerCustomer: true, startsAt: isoDay(addDays(-120)), endsAt: '', paused: false, uses: orders.filter(o => o.discountCode === 'WELCOME10').length },
      { id: `${storeId}-ds2`, storeId, method: 'code', code: 'FREESHIP500', title: '', type: 'free_delivery', value: 0, buyQty: 2, getQty: 1, appliesTo: 'all', minSpend: 500, eligibility: 'everyone', usageLimit: 0, oncePerCustomer: false, startsAt: isoDay(addDays(-100)), endsAt: '', paused: false, uses: orders.filter(o => o.discountCode === 'FREESHIP500').length },
      { id: `${storeId}-ds3`, storeId, method: 'code', code: 'DETTY25', title: '', type: 'percent', value: 25, buyQty: 2, getQty: 1, appliesTo: 'all', minSpend: 300, eligibility: 'everyone', usageLimit: 200, oncePerCustomer: true, startsAt: `${now.getFullYear()}-12-01`, endsAt: `${now.getFullYear() + 1}-01-05`, paused: false, uses: 0 },
      { id: `${storeId}-ds4`, storeId, method: 'automatic', code: '', title: `Buy 2 get 1 free: ${collections[1].title}`, type: 'buy_x_get_y', value: 0, buyQty: 2, getQty: 1, appliesTo: collections[1].id, minSpend: 0, eligibility: 'everyone', usageLimit: 0, oncePerCustomer: false, startsAt: isoDay(addDays(-10)), endsAt: isoDay(addDays(20)), paused: false, uses: 9 },
      { id: `${storeId}-ds5`, storeId, method: 'code', code: 'VIP50', title: '', type: 'fixed', value: 50, buyQty: 2, getQty: 1, appliesTo: 'all', minSpend: 250, eligibility: 'everyone', usageLimit: 40, oncePerCustomer: true, startsAt: isoDay(addDays(-45)), endsAt: '', paused: true, uses: 17 },
    ],
    giftCards: [
      { id: `${storeId}-g1`, storeId, code: 'GIFT-7KQ2-M9XA', initialValue: 500, balance: 180, customerId: customers[0].id, customerName: `${customers[0].firstName} ${customers[0].lastName}`, expiresAt: '', disabled: false, note: 'Birthday gift', createdAt: addDays(-40).toISOString() },
      { id: `${storeId}-g2`, storeId, code: 'GIFT-P3HD-2WLN', initialValue: 300, balance: 300, customerId: null, customerName: '', expiresAt: isoDay(addDays(200)), disabled: false, note: 'Giveaway winner (Instagram)', createdAt: addDays(-6).toISOString() },
    ],
    segments: [
      { id: `${storeId}-s1`, storeId, name: 'Big spenders', rule: { kind: 'spent_over', amount: 1500 } },
      { id: `${storeId}-s2`, storeId, name: 'Not ordered in 60 days', rule: { kind: 'no_order_days', days: 60 } },
      { id: `${storeId}-s3`, storeId, name: 'Happy to get WhatsApp/email offers', rule: { kind: 'accepts_marketing' } },
      { id: `${storeId}-s4`, storeId, name: 'Kumasi customers', rule: { kind: 'city', city: 'Kumasi' } },
    ],
    zones: [
      { id: `${storeId}-z1`, storeId, name: 'Greater Accra', areas: 'Accra, Tema, East Legon', fee: 30, eta: '1–2 days', active: true },
      { id: `${storeId}-z2`, storeId, name: 'Ashanti', areas: 'Kumasi and surroundings', fee: 45, eta: '2–3 days', active: true },
      { id: `${storeId}-z3`, storeId, name: 'Rest of Ghana', areas: 'All other regions', fee: 60, eta: '3–5 days', active: true },
      { id: `${storeId}-z4`, storeId, name: 'Store pickup', areas: storeId === 'finefits' ? 'Osu, Oxford Street' : 'Spintex Road', fee: 0, eta: 'Same day', active: true },
    ],
    payments: [
      { key: 'paystack', enabled: true, testMode: false, publicKey: 'pk_live_••••3f9a' },
      { key: 'flutterwave', enabled: storeId === 'finefits', testMode: true, publicKey: '' },
      { key: 'stripe', enabled: true, testMode: false, publicKey: 'pk_live_••••81bc' },
      { key: 'cod', enabled: true, testMode: false, publicKey: '', codFee: 10, codZones: ['Greater Accra', 'Ashanti'] },
    ],
    staff: [
      { id: 'st1', name: 'Abena Owusu', email: 'abena@' + d.domain, role: 'owner', invited: false },
      { id: 'st2', name: 'Kofi Asare', email: 'kofi@' + d.domain, role: 'orders', invited: false },
      { id: 'st3', name: 'Jordan', email: 'jordansancho72@gmail.com', role: 'developer', invited: false },
    ],
    pages: [
      { id: 'pg1', title: 'About us', body: `${d.name} is a Ghanaian brand. Tell your story here.`, visible: true },
      { id: 'pg2', title: 'Delivery & returns', body: 'Orders in Greater Accra arrive in 1–2 days. Returns accepted within 7 days in original condition.', visible: true },
      { id: 'pg3', title: 'Privacy policy', body: 'We only use your details to process and deliver your order.', visible: true },
    ],
    notifications: [
      { id: 'n1', at: orders[0].createdAt, text: `New order #${orders[0].number} from ${orders[0].customerName}`, link: `/orders/${orders[0].id}`, read: false },
      { id: 'n2', at: new Date(Date.now() - 5 * 3600000).toISOString(), text: `${products[1].title} is running low`, link: '/inventory', read: false },
      { id: 'n3', at: new Date(Date.now() - 26 * 3600000).toISOString(), text: 'Someone left GH₵240 in their cart', link: '/orders/abandoned', read: true },
    ],
    posStaff: [], shifts: [], tables: [], reservations: [], waConversations: [], waMessages: [],
  }
}


// ---------------------------------------------------------------- restaurant / café sample
function buildCafe(): StoreData {
  const sid = 'osu-cafe'
  const base = buildDemo('finefits')
  const r = rng(41)
  const cols = ['Coffee', 'Cold drinks', 'Breakfast', 'Mains', 'Pastries'].map((t, i) => ({ id: `${sid}-c${i}`, storeId: sid, title: t, description: '', visible: true, handle: slug(t) }))
  const cid = (t: string) => cols.find(c => c.title === t)!.id
  const size = { name: 'Size', required: true, max: 1, choices: [{ name: 'Regular', price: 0 }, { name: 'Large', price: 8 }] }
  const milk = { name: 'Milk', required: false, max: 1, choices: [{ name: 'Oat milk', price: 6 }, { name: 'Soy milk', price: 5 }] }
  const extras = { name: 'Extras', required: false, max: 3, choices: [{ name: 'Extra shot', price: 7 }, { name: 'Vanilla syrup', price: 5 }, { name: 'Caramel syrup', price: 5 }] }
  const spice = { name: 'Spice level', required: true, max: 1, choices: [{ name: 'Mild', price: 0 }, { name: 'Medium', price: 0 }, { name: 'Hot', price: 0 }] }
  const protein = { name: 'Add protein', required: false, max: 2, choices: [{ name: 'Grilled chicken', price: 25 }, { name: 'Fried egg', price: 8 }, { name: 'Tilapia fillet', price: 35 }] }
  const menu: [string, string, number, number, string, object[]][] = [
    ['Flat White', 'Coffee', 38, 25, 'Double ristretto with silky steamed milk.', [size, milk, extras]],
    ['Cappuccino', 'Coffee', 35, 30, 'Espresso, steamed milk and a thick foam cap.', [size, milk, extras]],
    ['Americano', 'Coffee', 28, 20, 'Espresso lengthened with hot water.', [size, extras]],
    ['Iced Latte', 'Cold drinks', 40, 200, 'Espresso over ice with cold milk.', [size, milk, extras]],
    ['Sobolo Spritz', 'Cold drinks', 30, 340, 'Hibiscus, ginger and pineapple, lightly sparkling.', [size]],
    ['Fresh Pineapple Juice', 'Cold drinks', 32, 55, 'Pressed to order.', [size]],
    ['Full Ghanaian Breakfast', 'Breakfast', 95, 35, 'Eggs, sausages, baked beans, fried plantain and toast.', [protein]],
    ['Avocado Toast', 'Breakfast', 70, 120, 'Sourdough, smashed avocado, chilli and lime.', [protein]],
    ['Jollof Rice & Chicken', 'Mains', 110, 15, 'Smoky party jollof with grilled chicken and coleslaw.', [spice, protein]],
    ['Waakye Bowl', 'Mains', 90, 5, 'Rice and beans with shito, gari, spaghetti and egg.', [spice, protein]],
    ['Grilled Tilapia & Banku', 'Mains', 150, 190, 'Whole tilapia with pepper sauce and onions.', [spice]],
    ['Butter Croissant', 'Pastries', 30, 45, 'Baked every morning.', []],
    ['Banana Bread', 'Pastries', 28, 30, 'With a spoon of honey butter.', []],
  ]
  const products = menu.map(([title, col, price, hue, desc, mods], i) => ({
    id: `${sid}-p${i}`, storeId: sid, title, description: desc, status: 'active' as const, images: [], hue, category: col, productType: col, vendor: 'Osu Coffee House',
    tags: [], collectionIds: [cid(col)], options: [], modifiers: mods as StoreData['products'][number]['modifiers'],
    variants: [{ id: `${sid}-p${i}-v0`, title: 'Default', options: [], sku: `OC-${String(i + 1).padStart(3, '0')}`, price, compareAt: null, cost: Math.round(price * 0.35), stock: 0, trackStock: false }],
    seoTitle: `${title} | Osu Coffee House`, seoDescription: desc, handle: slug(title), createdAt: addDays(-90).toISOString(), updatedAt: addDays(-3).toISOString(),
  }))
  const staff = [['Efua Mensah', 'manager'], ['Kwesi Ofori', 'cashier'], ['Adjoa Tetteh', 'waiter'], ['Yaw Boadu', 'waiter'], ['Chef Kojo', 'kitchen']].map(([name, role], i) => ({ id: `${sid}-s${i}`, storeId: sid, name, role: role as StoreData['posStaff'][number]['role'], active: true, pin: '1234' }))
  const tables = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'Bar 1', 'Bar 2', 'Patio 1', 'Patio 2'].map((name, i) => ({ id: `${sid}-t${i}`, storeId: sid, name, area: name.startsWith('Bar') ? 'Bar' : name.startsWith('Patio') ? 'Patio' : 'Main', seats: name.startsWith('Bar') ? 2 : i % 3 === 0 ? 6 : 4, status: 'free' as StoreData['tables'][number]['status'], position: i }))
  const customers = base.customers.map(c => ({ ...c, id: c.id.replace('finefits', sid), storeId: sid }))
  const now = new Date()
  const shifts: StoreData['shifts'] = []
  const orders: Order[] = []
  let no = 3001
  for (let day = 20; day >= 0; day--) {
    const date = addDays(-day)
    const onShift = day === 0 ? [staff[1], staff[2], staff[3]] : [staff[1 + (day % 2)], staff[3]]
    for (const st of onShift) {
      const start = new Date(date); start.setHours(7, 0, 0, 0)
      const end = new Date(date); end.setHours(16, 0, 0, 0)
      if (start > now) continue
      shifts.push({ id: `${sid}-sh${day}-${st.id}`, storeId: sid, staffId: st.id, staffName: st.name, startedAt: start.toISOString(), endedAt: day === 0 ? null : end.toISOString(), openingFloat: st.role === 'cashier' ? 200 : 0, cashCounted: day === 0 ? null : 0, expectedCash: day === 0 ? null : 0, note: '' })
    }
    const count = day === 0 ? 14 : 18 + Math.floor(r() * 16)
    for (let k = 0; k < count; k++) {
      const at = new Date(date); at.setHours(7 + Math.floor(r() * 12), Math.floor(r() * 60))
      if (at > now) continue
      const nItems = 1 + Math.floor(r() * 3)
      const items: LineItem[] = []
      for (let j = 0; j < nItems; j++) {
        const p = pick(r, products)
        const mods = p.modifiers.flatMap(g => g.required ? [g.choices[Math.floor(r() * g.choices.length)]] : r() < 0.3 ? [g.choices[0]] : [])
        items.push({ productId: p.id, variantId: p.variants[0].id, title: p.title, variantTitle: 'Default', price: p.variants[0].price + mods.reduce((s, m) => s + m.price, 0), qty: r() < 0.8 ? 1 : 2, hue: p.hue, modifiers: mods })
      }
      const sub = items.reduce((s, x) => s + x.price * x.qty, 0)
      const ch: Channel = r() < 0.72 ? 'pos' : r() < 0.6 ? 'whatsapp' : 'online'
      const service: Order['service'] = ch === 'pos' ? (r() < 0.65 ? 'dine_in' : 'takeaway') : r() < 0.6 ? 'delivery' : 'pickup'
      const st = pick(r, onShift)
      const table = service === 'dine_in' ? pick(r, tables) : null
      const svc = service === 'dine_in' ? Math.round(sub * 0.05) : 0
      const tip = service === 'dine_in' && r() < 0.3 ? 10 : 0
      const fee = service === 'delivery' ? 25 : 0
      const pm: PaymentMethod = ch === 'pos' ? (r() < 0.45 ? 'cash' : r() < 0.8 ? 'momo_manual' : 'paystack_card') : 'paystack_momo'
      const fresh = day === 0 && now.getTime() - at.getTime() < 50 * 60000
      const kitchen = fresh ? (now.getTime() - at.getTime() < 12 * 60000 ? 'new' : now.getTime() - at.getTime() < 30 * 60000 ? 'preparing' : 'ready') : 'served'
      const paid = !(fresh && service === 'dine_in')
      orders.push({
        id: `${sid}-o${no}`, storeId: sid, number: no++, createdAt: at.toISOString(), customerId: ch === 'pos' ? null : pick(r, customers).id, customerName: ch === 'pos' ? (table ? `Table ${table.name}` : 'Walk-in') : pick(r, customers).firstName,
        phone: '', email: '', address: { line1: '', city: 'Accra', region: 'Greater Accra', country: 'Ghana' }, channel: ch, service, items, subtotal: sub,
        discountCode: null, discountAmount: 0, giftCardCode: null, giftCardAmount: 0, deliveryMethod: service === 'delivery' ? 'Greater Accra' : service === 'pickup' ? 'Store pickup' : '', deliveryFee: fee,
        serviceCharge: svc, tip, tax: 0, total: sub + svc + tip + fee, paymentMethod: pm, paymentStatus: paid ? 'paid' : 'pending', refunded: 0,
        fulfilmentStatus: kitchen === 'served' ? 'fulfilled' : 'unfulfilled', deliveryStatus: kitchen === 'served' ? (service === 'delivery' ? 'delivered' : 'picked_up') : 'none',
        kitchenStatus: kitchen as Order['kitchenStatus'], tableId: table?.id ?? null, carrier: '', tracking: '', tags: [], note: r() < 0.08 ? 'No onions please' : '',
        staff: ch === 'pos' ? st.name : null, staffId: ch === 'pos' ? st.id : null, shiftId: ch === 'pos' ? `${sid}-sh${day}-${st.id}` : null,
        timeline: [{ at: at.toISOString(), text: ch === 'pos' ? `Order taken by ${st.name}` : 'Order placed' }],
      })
      if (!paid && table) table.status = 'ordered'
    }
  }
  orders.reverse()
  for (const sh of shifts) if (sh.endedAt) {
    const cash = orders.filter(o => o.shiftId === sh.id && o.paymentMethod === 'cash').reduce((s, o) => s + o.total, 0)
    sh.expectedCash = sh.openingFloat + cash; sh.cashCounted = sh.expectedCash - (r() < 0.2 ? 10 : 0)
  }
  const at = (h: number, m: number, d = 0) => { const x = addDays(d); x.setHours(h, m, 0, 0); return x.toISOString() }
  const reservations: StoreData['reservations'] = [
    ['Nana Agyeman', 4, at(19, 0), 'booked', 'Birthday, bring a candle'], ['Akosua Darko', 2, at(19, 30), 'booked', ''], ['Kofi Boateng', 6, at(20, 0), 'booked', 'Prefers the patio'],
    ['Esi Quaye', 2, at(12, 30), 'completed', ''], ['Selasi Tetteh', 3, at(13, 0), 'no_show', ''], ['Abena Osei', 8, at(19, 0, 1), 'booked', 'Office dinner, deposit paid'], ['Yaw Addo', 2, at(18, 30, 2), 'booked', ''],
  ].map(([name, party, when, status, notes], i) => ({ id: `${sid}-r${i}`, storeId: sid, name: name as string, phone: `+233 24 ${300 + i * 7} ${4100 + i * 13}`, email: '', partySize: party as number, startsAt: when as string, durationMin: 90, tableId: i === 2 ? tables[8].id : null, status: status as 'booked', depositAmount: (party as number) >= 6 ? 100 : 0, depositPaid: (party as number) >= 6, notes: notes as string, source: i % 2 ? 'whatsapp' : 'website', createdAt: addDays(-2).toISOString() }))
  const convs: StoreData['waConversations'] = [
    { id: `${sid}-w0`, storeId: sid, phone: '233244001122', name: 'Ama', needsHuman: false, lastMessageAt: new Date(Date.now() - 6 * 60000).toISOString(), state: { step: 'done' } },
    { id: `${sid}-w1`, storeId: sid, phone: '233201234567', name: 'Kwame', needsHuman: true, lastMessageAt: new Date(Date.now() - 25 * 60000).toISOString(), state: { step: 'human' } },
  ]
  const msgs: [number, 'in' | 'out', string][] = [
    [0, 'in', 'Hi'], [0, 'out', 'Welcome to Osu Coffee House 👋 Reply with a number to order:\n1. Flat White GH₵38\n2. Cappuccino GH₵35\n…\nOr reply MENU for the full menu.'], [0, 'in', '2 flat white, 1 banana bread'],
    [0, 'out', 'Got it:\n2 × Flat White (GH₵76)\n1 × Banana Bread (GH₵28)\nTotal GH₵104. Pickup or delivery?'], [0, 'in', 'pickup'], [0, 'out', 'Pay here with MoMo or card: pay.stockroom.shop/… Your order will be ready in about 15 minutes.'],
    [1, 'in', 'Hello, can I book a table for 12 people on Saturday?'], [1, 'out', 'For groups over 8 a team member will reply shortly. Thank you!'],
  ]
  return {
    ...base,
    store: { ...base.store, id: sid, name: 'Osu Coffee House', tagline: 'Café & kitchen', initials: 'OC', accent: '#8A4B1F', domain: 'osucoffee.com', email: 'hello@osucoffee.com', address: '7 Oxford Street, Osu, Accra', businessType: 'restaurant',
      storefront: { ...base.store.storefront, seoTitle: 'Osu Coffee House', heroTitle: 'Good coffee, proper food', heroText: 'Order ahead for pickup, get it delivered, or book a table.', heroButton: 'See the menu', announcement: 'Book a table for Friday night jazz', featuredCollectionId: cols[0].id },
      freeDeliveryOver: null,
      settings: { reservations: { enabled: true, opens: '12:00', closes: '22:00', slot_minutes: 30, duration_minutes: 90, max_covers: 40, max_party: 8, deposit_over_party: 6, deposit_amount: 100 }, pos: { serviceChargePct: 5, askTip: true, lockMinutes: 2 }, whatsapp: { enabled: true, phoneNumberId: '', displayNumber: '+233 24 555 0199', mode: 'chat', greeting: 'Welcome to Osu Coffee House 👋' } } },
    products, collections: cols, customers, orders, drafts: [], abandoned: [],
    discounts: [{ ...base.discounts[0], id: `${sid}-ds1`, storeId: sid, code: 'FIRSTCUP', value: 15, uses: 12 }, { ...base.discounts[3], id: `${sid}-ds2`, storeId: sid, title: 'Happy hour: buy 2 drinks, get 1 free', appliesTo: cols[1].id }],
    giftCards: [], segments: base.segments.map(x => ({ ...x, id: x.id.replace('finefits', sid), storeId: sid })),
    zones: [{ id: `${sid}-z1`, storeId: sid, name: 'Greater Accra', areas: 'Within 8 km of Osu', fee: 25, eta: '30–45 min', active: true }, { id: `${sid}-z2`, storeId: sid, name: 'Store pickup', areas: 'Oxford Street', fee: 0, eta: '15 min', active: true }],
    staff: base.staff.map(s => ({ ...s, email: s.email.replace('finefits.com.gh', 'osucoffee.com') })),
    notifications: [{ id: 'cn1', at: new Date(Date.now() - 4 * 60000).toISOString(), text: 'New booking: Kofi Boateng, 6 people', link: '/reservations', read: false }, { id: 'cn2', at: new Date(Date.now() - 25 * 60000).toISOString(), text: 'Kwame needs a reply on WhatsApp', link: '/whatsapp', read: false }],
    posStaff: staff, shifts, tables, reservations, waConversations: convs,
    waMessages: msgs.map(([c, dir, body], i) => ({ id: `${sid}-m${i}`, storeId: sid, conversationId: convs[c].id, direction: dir, body: body.replace(/\\n/g, '\n'), at: new Date(Date.now() - (40 - i * 4) * 60000).toISOString() })),
  }
}
