// Checks that every field survives a trip to the database and back.
// 1) node roundtrip.js export <sid>  -> prints {table: rows} and the store row
// 2) node roundtrip.js compare <file> -> rebuilds StoreData from DB rows and compares
import { buildDemo } from '../src/data/seed'
import { SPECS, storeRow, fromTables } from '../src/data/mapping'
import type { StoreData } from '../src/data/types'
import { readFileSync, writeFileSync } from 'fs'

const sid = '11111111-1111-4111-8111-111111111111'
function remap(d: StoreData): StoreData {
  const map = new Map<string, string>()
  let n = 0
  const id = (o: string) => { if (!map.has(o)) { n++; map.set(o, `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`) } return map.get(o)! }
  const out: StoreData = JSON.parse(JSON.stringify(d, (_k, v) => typeof v === 'string' && /^(finefits)(-|$)/.test(v) ? (v === 'finefits' ? sid : id(v)) : v))
  out.staff = []
  out.pages.forEach(p => { p.id = id('pg-' + p.id) }); out.notifications.forEach(x => { x.id = id('n-' + x.id) })
  // restaurant sample rows so those tables are exercised too
  const staffId = id('st'), tableId = id('tb'), convId = id('cv')
  out.posStaff = [{ id: staffId, storeId: sid, name: 'Kofi', role: 'cashier', active: true }]
  out.shifts = [{ id: id('sh'), storeId: sid, staffId, staffName: 'Kofi', startedAt: '2026-09-27T08:00:00.000Z', endedAt: null, openingFloat: 200, cashCounted: null, expectedCash: null, note: '' }]
  out.tables = [{ id: tableId, storeId: sid, name: 'T1', area: 'Main', seats: 4, status: 'free', position: 0 }]
  out.reservations = [{ id: id('rs'), storeId: sid, name: 'Ama', phone: '0244', email: '', partySize: 4, startsAt: '2026-09-28T18:00:00.000Z', durationMin: 90, tableId, status: 'booked', depositAmount: 0, depositPaid: false, notes: '', source: 'website', createdAt: '2026-09-27T08:00:00.000Z' }]
  out.waConversations = [{ id: convId, storeId: sid, phone: '233244000000', name: 'Ama', needsHuman: false, lastMessageAt: '2026-09-27T08:00:00.000Z', state: { step: 'menu' } }]
  out.waMessages = [{ id: id('wm'), storeId: sid, conversationId: convId, direction: 'in', body: 'hi', at: '2026-09-27T08:00:00.000Z' }]
  out.store.settings = { reservations: { enabled: true, opens: '12:00', closes: '22:00', slot_minutes: 30, duration_minutes: 90, max_covers: 40, max_party: 8, deposit_over_party: 6, deposit_amount: 100 } }
  return out
}

const [mode, file] = process.argv.slice(2)
const d = remap(buildDemo('finefits'))
if (mode === 'export') {
  const tables: Record<string, unknown[]> = {}
  for (const s of SPECS) if (s.table !== 'store_members') tables[s.table] = s.rows(d)
  writeFileSync(file, JSON.stringify({ store: { id: sid, ...storeRow(d.store) }, tables }))
  writeFileSync(file + '.expected', JSON.stringify(d))
} else {
  const back = JSON.parse(readFileSync(file, 'utf8'))
  const expected: StoreData = JSON.parse(readFileSync('/tmp/claude-0/rows.json.expected', 'utf8'))
  const got = fromTables(back.tables, back.store)
  got.staff = []
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon((v as Record<string, unknown>)[k])])) : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v).toISOString() : v
  const norm = (x: unknown) => canon(JSON.parse(JSON.stringify(x)))
  expected.staff = []
  const skipStore = (s: Record<string, unknown>) => { delete s.createdAt; delete s.nextOrderNumber; return s }
  const a = norm(expected) as Record<string, unknown>, b = norm(got) as Record<string, unknown>
  skipStore(a.store as Record<string, unknown>); skipStore(b.store as Record<string, unknown>)
  let bad = 0
  const sortById = (l: unknown) => Array.isArray(l) ? [...l].sort((x, y) => JSON.stringify((x as { id?: string; key?: string }).id ?? (x as { key?: string }).key ?? x).localeCompare(JSON.stringify((y as { id?: string }).id ?? (y as { key?: string }).key ?? y))) : l
  for (const k of Object.keys(a)) {
    const A = JSON.stringify(sortById(a[k])), B = JSON.stringify(sortById(b[k]))
    if (A !== B) {
      bad++
      const la = sortById(a[k]) as unknown[], lb = sortById(b[k]) as unknown[]
      if (Array.isArray(la)) { const i = la.findIndex((x, j) => JSON.stringify(x) !== JSON.stringify(lb[j])); console.log('MISMATCH', k, '\n  sent', JSON.stringify(la[i]).slice(0, 600), '\n  got ', JSON.stringify(lb?.[i]).slice(0, 600)) }
      else console.log('MISMATCH', k, '\n  sent', A.slice(0, 600), '\n  got ', B.slice(0, 600))
    }
  }
  console.log(bad ? `${bad} sections differ` : 'ROUNDTRIP OK')
}
