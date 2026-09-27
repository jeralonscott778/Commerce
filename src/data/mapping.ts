// Converts the dashboard's data (camelCase objects) to database rows (snake_case tables) and back,
// and works out exactly which rows changed so only those are saved.
import type { StoreData, Store } from './types'

type Row = Record<string, unknown>

const snake = (k: string) => k.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())

function toRow(obj: object, skip: string[] = [], rename: Record<string, string> = {}): Row {
  const r: Row = {}
  for (const [k, v] of Object.entries(obj)) {
    if (skip.includes(k) || v === undefined) continue
    r[rename[k] ?? snake(k)] = v
  }
  return r
}
function fromRow<T>(row: Row, skip: string[] = [], rename: Record<string, string> = {}): T {
  const o: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (skip.includes(k)) continue
    o[rename[k] ?? camel(k)] = v
  }
  return o as T
}
const num = (v: unknown) => (v == null ? v : Number(v))
const emptyToNull = (v: unknown) => (v === '' ? null : v)
const nullToEmpty = (v: unknown) => (v == null ? '' : v)

interface Spec {
  table: string
  key: (r: Row) => string
  rows: (d: StoreData) => Row[]
  canInsert?: boolean
}

/** Tables in the order they must be inserted (parents before children). Deletes run in reverse. */
export const SPECS: Spec[] = [
  { table: 'collections', key: r => String(r.id), rows: d => d.collections.map((c, i) => ({ ...toRow(c), position: i })) },
  { table: 'customers', key: r => String(r.id), rows: d => d.customers.map(c => toRow(c, [], { acceptsWhatsApp: 'accepts_whatsapp' })) },
  { table: 'products', key: r => String(r.id), rows: d => d.products.map(p => toRow(p, ['variants'])) },
  { table: 'product_variants', key: r => String(r.id), rows: d => d.products.flatMap(p => p.variants.map((v, i) => ({ ...toRow(v), product_id: p.id, store_id: p.storeId, position: i }))) },
  { table: 'segments', key: r => String(r.id), rows: d => d.segments.map(s => toRow(s)) },
  { table: 'dining_tables', key: r => String(r.id), rows: d => d.tables.map(t => toRow(t)) },
  { table: 'pos_staff', key: r => String(r.id), rows: d => d.posStaff.map(s => toRow(s, ['pin'])) },
  { table: 'shifts', key: r => String(r.id), rows: d => d.shifts.map(s => toRow(s)) },
  { table: 'orders', key: r => String(r.id), rows: d => d.orders.map(o => toRow(o, [], { staff: 'staff_name' })) },
  { table: 'draft_orders', key: r => String(r.id), rows: d => d.drafts.map(o => toRow(o)) },
  { table: 'abandoned_checkouts', key: r => String(r.id), rows: d => d.abandoned.map(o => toRow(o)) },
  { table: 'discounts', key: r => String(r.id), rows: d => d.discounts.map(x => ({ ...toRow(x), ends_at: emptyToNull(x.endsAt) })) },
  { table: 'gift_cards', key: r => String(r.id), rows: d => d.giftCards.map(g => ({ ...toRow(g), expires_at: emptyToNull(g.expiresAt) })) },
  { table: 'delivery_zones', key: r => String(r.id), rows: d => d.zones.map((z, i) => ({ ...toRow(z), position: i })) },
  { table: 'payment_settings', key: r => String(r.provider), rows: d => d.payments.map(p => ({ cod_fee: 0, cod_zones: [], ...toRow(p, ['key'], {}), provider: p.key, store_id: d.store.id })) },
  { table: 'pages', key: r => String(r.id), rows: d => d.pages.map(p => ({ ...toRow(p), store_id: d.store.id })) },
  { table: 'notifications', key: r => String(r.id), rows: d => d.notifications.map(n => ({ ...toRow(n), store_id: d.store.id })) },
  { table: 'reservations', key: r => String(r.id), rows: d => d.reservations.map(x => toRow(x)) },
  { table: 'wa_conversations', key: r => String(r.id), rows: d => d.waConversations.map(x => toRow(x)) },
  { table: 'wa_messages', key: r => String(r.id), rows: d => d.waMessages.map(x => toRow(x)) },
  { table: 'store_members', key: r => String(r.user_id), rows: d => d.staff.filter(s => !s.invited).map(s => ({ store_id: d.store.id, user_id: s.id, name: s.name, email: s.email, role: s.role })), canInsert: false },
]

export const storeRow = (s: Store): Row => toRow(s, ['id', 'nextOrderNumber', 'createdAt'])

export interface Change {
  table: string
  keyCol: string
  insert: Row[]                                   // brand-new rows (full)
  update: { key: string; patch: Row }[]           // only the columns that changed
  remove: string[]
}

/**
 * Compares two versions of the store and lists what to save.
 * Existing rows send only changed columns, so a change made in the dashboard never
 * overwrites something the server changed meanwhile (e.g. a payment being confirmed).
 */
export function diff(prev: StoreData, next: StoreData): { changes: Change[]; store: Row | null } {
  const changes: Change[] = []
  for (const spec of SPECS) {
    const a = new Map(spec.rows(prev).map(r => [spec.key(r), r]))
    const bRows = spec.rows(next)
    const b = new Map(bRows.map(r => [spec.key(r), r]))
    const insert: Row[] = [], update: Change['update'] = []
    for (const r of bRows) {
      const old = a.get(spec.key(r))
      if (!old) { if (spec.canInsert !== false) insert.push(r); continue }
      const patch: Row = {}
      for (const k of Object.keys(r)) if (JSON.stringify(r[k]) !== JSON.stringify(old[k])) patch[k] = r[k]
      if (Object.keys(patch).length) update.push({ key: spec.key(r), patch })
    }
    const remove = [...a.keys()].filter(k => !b.has(k))
    if (insert.length || update.length || remove.length)
      changes.push({ table: spec.table, insert, update, remove, keyCol: spec.table === 'payment_settings' ? 'provider' : spec.table === 'store_members' ? 'user_id' : 'id' })
  }
  const sa = storeRow(prev.store), sb = storeRow(next.store)
  const patch: Row = {}
  for (const k of Object.keys(sb)) if (JSON.stringify(sb[k]) !== JSON.stringify(sa[k])) patch[k] = sb[k]
  return { changes, store: Object.keys(patch).length ? patch : null }
}

/** Builds the dashboard's data from the rows loaded for one store. */
export function fromTables(t: Record<string, Row[]>, storeRowData: Row): StoreData {
  const store = fromRow<Store>(storeRowData)
  store.freeDeliveryOver = num(store.freeDeliveryOver) as number | null
  store.storefront = { ...{ public: true, password: '', seoTitle: '', seoDescription: '', announcement: '', announcementOn: false, heroTitle: store.name, heroText: '', heroButton: 'Shop now', featuredCollectionId: null, whatsapp: '', instagram: '' }, ...((store.storefront ?? {}) as Partial<Store['storefront']>) } as Store['storefront']
  store.settings = store.settings ?? {}
  const variants = (t.product_variants ?? []).slice().sort((a, b) => Number(a.position) - Number(b.position))
  const byProduct = new Map<string, Row[]>()
  for (const v of variants) byProduct.set(String(v.product_id), [...(byProduct.get(String(v.product_id)) ?? []), v])
  const list = <T,>(name: string, skip: string[] = [], rename: Record<string, string> = {}) => (t[name] ?? []).map(r => fromRow<T>(r, skip, rename))
  const sortPos = (rows: Row[]) => rows.slice().sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))

  return {
    store,
    collections: sortPos(t.collections ?? []).map(r => fromRow(r, ['position'])),
    customers: list('customers', [], { accepts_whatsapp: 'acceptsWhatsApp' }),
    products: list<StoreData['products'][number]>('products').map(p => ({
      ...p, variants: (byProduct.get(p.id) ?? []).map(v => ({ ...fromRow<StoreData['products'][number]['variants'][number]>(v, ['product_id', 'store_id', 'position']), price: Number(v.price), compareAt: num(v.compare_at) as number | null, cost: num(v.cost) as number | null })),
    })),
    segments: list('segments'),
    tables: sortPos(t.dining_tables ?? []).map(r => fromRow(r)),
    posStaff: list('pos_staff', ['pin_hash', 'created_at']),
    shifts: list('shifts'),
    orders: list<StoreData['orders'][number]>('orders', [], { staff_name: 'staff' }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    drafts: list('draft_orders'),
    abandoned: list('abandoned_checkouts'),
    discounts: list<StoreData['discounts'][number]>('discounts').map(x => ({ ...x, endsAt: nullToEmpty(x.endsAt) as string, appliesTo: x.appliesTo || 'all' })),
    giftCards: list<StoreData['giftCards'][number]>('gift_cards').map(g => ({ ...g, expiresAt: nullToEmpty(g.expiresAt) as string })),
    zones: sortPos(t.delivery_zones ?? []).map(r => fromRow(r, ['position'])),
    payments: (t.payment_settings ?? []).map(r => ({ ...fromRow<StoreData['payments'][number]>(r, ['store_id', 'provider']), key: r.provider as StoreData['payments'][number]['key'] }))
      .sort((a, b) => ['paystack', 'flutterwave', 'stripe', 'cod'].indexOf(a.key) - ['paystack', 'flutterwave', 'stripe', 'cod'].indexOf(b.key)),
    staff: (t.store_members ?? []).map(r => ({ id: String(r.user_id), name: String(r.name || r.email), email: String(r.email), role: r.role as StoreData['staff'][number]['role'], invited: false })),
    pages: list('pages', ['store_id']),
    notifications: list<StoreData['notifications'][number]>('notifications', ['store_id']).sort((a, b) => b.at.localeCompare(a.at)),
    reservations: list<StoreData['reservations'][number]>('reservations').sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    waConversations: list<StoreData['waConversations'][number]>('wa_conversations').sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    waMessages: list<StoreData['waMessages'][number]>('wa_messages').sort((a, b) => a.at.localeCompare(b.at)),
  }
}

export const LOAD_TABLES = SPECS.map(s => s.table)
