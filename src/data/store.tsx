// The data layer.
// LIVE mode (Supabase keys set): loads the signed-in team's store and saves every change to the database.
// DEMO mode (no keys): sample stores kept in the browser, so the dashboard can be previewed anywhere.
// Screens only use useData(); they never talk to the database directly.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { StoreData } from './types'
import { buildDemo, DEMO_STORES } from './seed'
import { setCurrency, uid, readFileDataURL } from '../lib/util'
import { LIVE, supabase } from '../lib/supabase'
import { diff, fromTables, LOAD_TABLES } from './mapping'

const KEY = 'stockroom-demo-v2'

export interface StoreSummary { id: string; name: string; initials: string; accent: string; role?: string }

interface Api {
  nextOrderNumber: () => Promise<number>
  uploadImage: (file: File) => Promise<string>
  addMember: (email: string, role: string, name: string) => Promise<'added' | 'no_account'>
  setSecret: (key: string, value: string) => Promise<void>
  hasSecret: (key: string) => Promise<boolean>
  setStaffPin: (staffId: string, pin: string) => Promise<void>
  checkStaffPin: (staffId: string, pin: string) => Promise<boolean>
  createStore: (name: string, ownerName: string, withSample: boolean, type: StoreData['store']['businessType']) => Promise<void>
  reload: () => Promise<void>
  /** Resolves once every change made so far has been saved. */
  flush: () => Promise<void>
  signOut: () => Promise<void>
}

interface Ctx {
  data: StoreData
  storeId: string
  stores: StoreSummary[]
  setStoreId: (id: string) => void
  update: (fn: (d: StoreData) => void) => void
  resetDemo: () => void
  live: boolean
  saving: boolean
  userEmail: string
  api: Api
}

const DataCtx = createContext<Ctx | null>(null)
const ToastCtx = createContext<(text: string) => void>(() => {})

// ---------------------------------------------------------------- demo mode
function loadDemo(): Record<string, StoreData> {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) } catch { /* ignore */ }
  return Object.fromEntries(DEMO_STORES.map(s => [s.id, buildDemo(s.id)]))
}

function DemoProvider({ children }: { children: ReactNode }) {
  const [all, setAll] = useState<Record<string, StoreData>>(loadDemo)
  const [storeId, setStoreIdState] = useState(() => { try { return localStorage.getItem(KEY + ':store') || DEMO_STORES[0].id } catch { return DEMO_STORES[0].id } })
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* ignore */ } }, [all])
  const setStoreId = useCallback((id: string) => { setStoreIdState(id); try { localStorage.setItem(KEY + ':store', id) } catch { /* ignore */ } }, [])
  const update = useCallback((fn: (d: StoreData) => void) => setAll(prev => { const d = structuredClone(prev[storeId]); fn(d); return { ...prev, [storeId]: d } }), [storeId])
  const resetDemo = useCallback(() => { try { localStorage.removeItem(KEY) } catch { /* ignore */ } setAll(Object.fromEntries(DEMO_STORES.map(s => [s.id, buildDemo(s.id)]))) }, [])
  const data = all[storeId] ?? all[DEMO_STORES[0].id]
  setCurrency(data.store.currency)
  const stores = useMemo(() => Object.values(all).map(d => ({ id: d.store.id, name: d.store.name, initials: d.store.initials, accent: d.store.accent })), [all])
  const api: Api = {
    nextOrderNumber: async () => data.orders.reduce((m, o) => Math.max(m, o.number), 1000) + 1,
    uploadImage: readFileDataURL,
    addMember: async () => 'added',
    setSecret: async () => {},
    hasSecret: async () => false,
    setStaffPin: async (sid, pin) => update(d => { const s = d.posStaff.find(x => x.id === sid); if (s) s.pin = pin }),
    checkStaffPin: async (sid, pin) => data.posStaff.find(x => x.id === sid)?.pin === pin,
    createStore: async () => {},
    reload: async () => {},
    flush: async () => {},
    signOut: async () => {},
  }
  return <DataCtx.Provider value={{ data, storeId, stores, setStoreId, update, resetDemo, live: false, saving: false, userEmail: 'demo', api }}>{children}</DataCtx.Provider>
}

// ---------------------------------------------------------------- live mode
async function loadStore(sid: string): Promise<StoreData> {
  const sb = supabase!
  const [storeRes, ...tables] = await Promise.all([
    sb.from('stores').select('*').eq('id', sid).single(),
    ...LOAD_TABLES.map(t => {
      let q = sb.from(t).select('*').eq('store_id', sid)
      if (t === 'orders') q = q.order('created_at', { ascending: false }).limit(2000)
      if (t === 'wa_messages') q = q.order('at', { ascending: false }).limit(1000)
      if (t === 'notifications') q = q.order('at', { ascending: false }).limit(50)
      return q
    }),
  ])
  if (storeRes.error) throw storeRes.error
  const map: Record<string, Record<string, unknown>[]> = {}
  LOAD_TABLES.forEach((t, i) => { if (tables[i].error) throw tables[i].error; map[t] = tables[i].data ?? [] })
  return fromTables(map, storeRes.data)
}

async function pushChanges(sid: string, prev: StoreData, next: StoreData) {
  const sb = supabase!
  const { changes, store } = diff(prev, next)
  if (store) { const { error } = await sb.from('stores').update(store).eq('id', sid); if (error) throw error }
  for (const c of changes) {
    for (let i = 0; i < c.insert.length; i += 200) {
      const { error } = await sb.from(c.table).insert(c.insert.slice(i, i + 200), { defaultToNull: false })
      if (error) throw new Error(`${c.table}: ${error.message}`)
    }
    // Updates run a few at a time to stay quick on slow connections.
    for (let i = 0; i < c.update.length; i += 8) {
      const res = await Promise.all(c.update.slice(i, i + 8).map(u => sb.from(c.table).update(u.patch).eq('store_id', sid).eq(c.keyCol, u.key)))
      const bad = res.find(r => r.error); if (bad?.error) throw new Error(`${c.table}: ${bad.error.message}`)
    }
  }
  for (const c of [...changes].reverse()) {
    if (!c.remove.length) continue
    const { error } = await sb.from(c.table).delete().eq('store_id', sid).in(c.keyCol, c.remove)
    if (error) throw new Error(`${c.table}: ${error.message}`)
  }
}

function LiveProvider({ children, session }: { children: ReactNode; session: Session }) {
  const toast = useContext(ToastCtx)
  const [stores, setStores] = useState<StoreSummary[] | null>(null)
  const [storeId, setStoreIdState] = useState<string>(() => { try { return localStorage.getItem('stockroom-store') ?? '' } catch { return '' } })
  const [data, setData] = useState<StoreData | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(0)
  const dataRef = useRef<StoreData | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  dataRef.current = data

  const loadStores = useCallback(async () => {
    const { data: rows, error: e } = await supabase!.from('store_members').select('role, stores(id, name, initials, accent)').eq('user_id', session.user.id)
    if (e) { setError(e.message); return [] }
    const list = (rows ?? []).map(r => { const s = r.stores as unknown as { id: string; name: string; initials: string; accent: string }; return { ...s, role: r.role as string } })
    setStores(list)
    return list
  }, [session.user.id])

  const setStoreId = useCallback((id: string) => { setStoreIdState(id); try { localStorage.setItem('stockroom-store', id) } catch { /* ignore */ } }, [])

  useEffect(() => { loadStores().then(list => { if (list.length && !list.some(s => s.id === storeId)) setStoreId(list[0].id) }) }, [loadStores]) // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    if (!storeId) return
    try { const d = await loadStore(storeId); setData(d); setError('') } catch (e) { setError((e as Error).message) }
  }, [storeId])

  useEffect(() => { setData(null); if (storeId && stores?.some(s => s.id === storeId)) reload() }, [storeId, stores, reload])

  // Live updates: new website orders, bookings and WhatsApp messages appear without refreshing.
  useEffect(() => {
    if (!storeId) return
    let timer: ReturnType<typeof setTimeout>
    const ch = supabase!.channel('store-' + storeId)
    for (const t of ['orders', 'notifications', 'reservations', 'wa_conversations', 'wa_messages']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `store_id=eq.${storeId}` }, () => {
        clearTimeout(timer); timer = setTimeout(() => { if (!savingRef.current) reload() }, 800)
      })
    }
    ch.subscribe()
    return () => { clearTimeout(timer); supabase!.removeChannel(ch) }
  }, [storeId, reload])
  const savingRef = useRef(0)
  savingRef.current = saving

  const update = useCallback((fn: (d: StoreData) => void) => {
    const prev = dataRef.current; if (!prev) return
    const next = structuredClone(prev); fn(next)
    dataRef.current = next
    setData(next)
    setSaving(s => s + 1)
    queue.current = queue.current.then(() => pushChanges(prev.store.id, prev, next)).catch(async e => {
      toast(`Couldn’t save: ${(e as Error).message}. Reloading the latest version.`)
      await reload()
    }).finally(() => setSaving(s => s - 1))
  }, [reload, toast])

  const api: Api = {
    nextOrderNumber: async () => { const { data: n, error: e } = await supabase!.rpc('next_order_number', { sid: storeId }); if (e) throw e; return n as number },
    uploadImage: async (file: File) => {
      const path = `${storeId}/${uid()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { error: e } = await supabase!.storage.from('product-images').upload(path, file, { cacheControl: '31536000' })
      if (e) throw e
      return supabase!.storage.from('product-images').getPublicUrl(path).data.publicUrl
    },
    addMember: async (email, role, name) => { const { data: r, error: e } = await supabase!.rpc('add_member', { sid: storeId, member_email: email, member_role: role, member_name: name }); if (e) throw e; if (r === 'added') await reload(); return r },
    setSecret: async (key, value) => { const { error: e } = await supabase!.rpc('set_store_secret', { sid: storeId, secret_key: key, secret_value: value }); if (e) throw e },
    hasSecret: async key => { const { data: r } = await supabase!.rpc('has_store_secret', { sid: storeId, secret_key: key }); return !!r },
    setStaffPin: async (sid, pin) => { const { error: e } = await supabase!.rpc('set_staff_pin', { staff: sid, pin }); if (e) throw e },
    checkStaffPin: async (sid, pin) => { const { data: r } = await supabase!.rpc('check_staff_pin', { staff: sid, pin }); return !!r },
    createStore: async (name, ownerName, withSample, type) => {
      const { data: sid, error: e } = await supabase!.rpc('create_store', { store_name: name, owner_name: ownerName }); if (e) throw e
      await supabase!.from('stores').update({ business_type: type }).eq('id', sid)
      if (withSample) {
        const empty = await loadStore(sid as string)
        const sample = remapIds(buildDemo('finefits'), sid as string, empty)
        await pushChanges(sid as string, empty, sample)
        await supabase!.from('stores').update({ next_order_number: Math.max(...sample.orders.map(o => o.number)) + 1 }).eq('id', sid)
      }
      await loadStores(); setStoreId(sid as string)
    },
    reload,
    flush: () => queue.current,
    signOut: async () => { await supabase!.auth.signOut() },
  }

  if (error && !data) return <FullMessage title="Couldn’t load your store" body={error} action={<button className="btn" onClick={() => location.reload()}>Try again</button>} />
  if (!stores) return <FullMessage title="Loading…" />
  if (!stores.length) return <DataCtx.Provider value={{ data: null as unknown as StoreData, storeId: '', stores: [], setStoreId, update, resetDemo: () => {}, live: true, saving: false, userEmail: session.user.email ?? '', api }}><Onboarding /></DataCtx.Provider>
  if (!data) return <FullMessage title="Loading your store…" />
  setCurrency(data.store.currency)
  return <DataCtx.Provider value={{ data, storeId, stores, setStoreId, update, resetDemo: () => {}, live: true, saving: saving > 0, userEmail: session.user.email ?? '', api }}>{children}</DataCtx.Provider>
}

/** Sample data uses readable ids; the database needs real ones. Keeps the default rows the store already has. */
function remapIds(d: StoreData, sid: string, existing: StoreData): StoreData {
  const map = new Map<string, string>()
  const id = (old: string) => { if (!map.has(old)) map.set(old, uid()); return map.get(old)! }
  const json = JSON.stringify(d, (k, v) => {
    if (typeof v === 'string' && /^(finefits|xanthea)-/.test(v)) return v === 'finefits' ? sid : id(v)
    return v
  }).replaceAll('"storeId":"finefits"', `"storeId":"${sid}"`)
  const out: StoreData = JSON.parse(json)
  out.store = { ...existing.store, storefront: out.store.storefront, tagline: out.store.tagline, domain: existing.store.domain, freeDeliveryOver: out.store.freeDeliveryOver }
  out.store.storefront.featuredCollectionId = out.collections[1]?.id ?? null
  out.zones = existing.zones; out.payments = existing.payments; out.staff = existing.staff
  out.notifications = []; out.pages = out.pages.map(p => ({ ...p, id: uid() }))
  out.segments = out.segments.map(s => ({ ...s, id: uid(), storeId: sid }))
  out.drafts = out.drafts.map((x, i) => ({ ...x, id: uid(), number: i + 1 }))
  out.orders.forEach(o => { o.id = uid() })
  return out
}

// ---------------------------------------------------------------- auth screens
function FullMessage({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <div className="auth-wrap"><div className="auth-card" style={{ textAlign: 'center' }}><h1 style={{ fontSize: 20 }}>{title}</h1>{body && <p className="muted">{body}</p>}{action}</div></div>
}

function Login() {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg('')
    const sb = supabase!
    const r = mode === 'in' ? await sb.auth.signInWithPassword({ email, password: pw })
      : mode === 'up' ? await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin + location.pathname } })
        : await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })
    setBusy(false)
    if (r.error) return setMsg(r.error.message === 'Invalid login credentials' ? 'Wrong email or password.' : r.error.message)
    if (mode === 'up') setMsg(r.data && 'session' in r.data && r.data.session ? '' : 'Check your email and click the link to confirm your account, then sign in.')
    if (mode === 'reset') setMsg('We sent you a link to reset your password.')
  }
  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}><div className="brand-mark" style={{ background: 'var(--ink)' }}>S</div><div><b>Stockroom</b><span>Store admin</span></div></div>
        <h1 style={{ fontSize: 22 }}>{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create your account' : 'Reset your password'}</h1>
        <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        {mode !== 'reset' && <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" required minLength={8} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} value={pw} onChange={e => setPw(e.target.value)} />{mode === 'up' && <span className="hint">At least 8 characters.</span>}</div>}
        {msg && <p className="small" style={{ color: msg.startsWith('Check') || msg.startsWith('We sent') ? 'var(--good)' : 'var(--bad)' }}>{msg}</p>}
        <button className="btn primary" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}</button>
        <div className="row between small">
          {mode === 'in' ? <button type="button" className="back-link" onClick={() => setMode('up')}>Create an account</button> : <button type="button" className="back-link" onClick={() => setMode('in')}>Back to sign in</button>}
          {mode === 'in' && <button type="button" className="back-link" onClick={() => setMode('reset')}>Forgot password?</button>}
        </div>
      </form>
    </div>
  )
}

function Onboarding() {
  const { api, userEmail } = useData()
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [type, setType] = useState<StoreData['store']['businessType']>('retail')
  const [sample, setSample] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={async e => { e.preventDefault(); setBusy(true); setErr(''); try { await api.createStore(name.trim(), owner.trim(), sample, type) } catch (x) { setErr((x as Error).message) } setBusy(false) }}>
        <h1 style={{ fontSize: 22 }}>Set up a store</h1>
        <p className="muted small">Signed in as {userEmail}. If a store owner added you to their team, ask them to check the email they used, then sign in again.</p>
        <div className="field"><label htmlFor="sn">Store name</label><input id="sn" type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. FineFits" /></div>
        <div className="field"><label htmlFor="on">Your name</label><input id="on" type="text" value={owner} onChange={e => setOwner(e.target.value)} /></div>
        <div className="field"><label htmlFor="bt">Type of business</label><select id="bt" value={type} onChange={e => setType(e.target.value as typeof type)}><option value="retail">Shop</option><option value="restaurant">Restaurant or café</option><option value="services">Services (bookings)</option></select></div>
        <label className="check-row"><input type="checkbox" checked={sample} onChange={e => setSample(e.target.checked)} />Fill it with sample products and orders so I can try things out</label>
        {err && <p className="error">{err}</p>}
        <button className="btn primary" disabled={busy || !name.trim()} type="submit">{busy ? 'Creating…' : 'Create store'}</button>
        <button type="button" className="back-link" onClick={() => api.signOut()}>Sign out</button>
      </form>
    </div>
  )
}

// ---------------------------------------------------------------- entry
export function DataProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(LIVE ? undefined : null)
  useEffect(() => {
    if (!LIVE) return
    supabase!.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  if (!LIVE) return <DemoProvider>{children}</DemoProvider>
  if (session === undefined) return <FullMessage title="Loading…" />
  if (!session) return <Login />
  return <LiveProvider key={session.user.id} session={session}>{children}</LiveProvider>
}

export function useData() {
  const c = useContext(DataCtx)
  if (!c) throw new Error('useData must be inside DataProvider')
  return c
}

// ---------------------------------------------------------------- toasts
type Toast = { id: number; text: string }
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t.slice(-2), { id, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className="toast">{t.text}</div>)}</div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)
