import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useData, useToast } from '../data/store'
import type { DeliveryZone, PaymentProvider, StaffMember, Store } from '../data/types'
import { PageHead, Field, Switch, Modal, Badge, MoneyInput, ConfirmButton } from '../components/ui'
import { uid } from '../lib/util'

const SWATCHES = ['#1F5E4B', '#6A3D62', '#1E4E8C', '#9A3B2B', '#7A5A12', '#111318', '#0F7C82']

export function General() {
  const { data, update, resetDemo, live } = useData()
  const toast = useToast()
  const [s, setS] = useState<Store>(structuredClone(data.store))
  const set = (p: Partial<Store>) => setS(x => ({ ...x, ...p }))
  const save = () => {
    if (!s.name.trim()) return toast('Your store needs a name')
    update(d => { d.store = { ...s, initials: (s.initials || s.name.slice(0, 2)).toUpperCase() } })
    toast('Settings saved')
  }
  return (
    <>
      <PageHead title="Settings" subtitle="Your store’s details, brand and defaults." actions={<button className="btn primary" onClick={save}>Save</button>} />
      <div className="two-col">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Store details</h2></div>
            <div className="card-body">
              <div className="grid2">
                <Field label="Store name" htmlFor="sn"><input id="sn" type="text" value={s.name} onChange={e => set({ name: e.target.value })} /></Field>
                <Field label="Short description" htmlFor="tg"><input id="tg" type="text" value={s.tagline} onChange={e => set({ tagline: e.target.value })} /></Field>
              </div>
              <div className="grid2">
                <Field label="Customer email" htmlFor="em"><input id="em" type="email" value={s.email} onChange={e => set({ email: e.target.value })} /></Field>
                <Field label="Phone / WhatsApp" htmlFor="ph"><input id="ph" type="tel" value={s.phone} onChange={e => set({ phone: e.target.value })} /></Field>
              </div>
              <Field label="Business address" htmlFor="ad"><input id="ad" type="text" value={s.address} onChange={e => set({ address: e.target.value })} /></Field>
              <Field label="Website address" htmlFor="dm"><input id="dm" type="text" value={s.domain} onChange={e => set({ domain: e.target.value })} /></Field>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Money, tax and stock</h2></div>
            <div className="card-body">
              <div className="grid3">
                <Field label="Currency" htmlFor="cu"><select id="cu" value={s.currency} onChange={e => set({ currency: e.target.value as Store['currency'] })}><option value="GHS">Ghana cedi (GH₵)</option><option value="NGN">Naira (₦)</option><option value="USD">US dollar ($)</option></select></Field>
                <Field label="VAT and levies" htmlFor="tx"><div className="input-group"><input id="tx" type="number" min={0} value={s.taxRate} onChange={e => set({ taxRate: Number(e.target.value) || 0 })} /><span>%</span></div></Field>
                <Field label="Low stock alert at" htmlFor="ls"><input id="ls" type="number" min={0} value={s.lowStockAt} onChange={e => set({ lowStockAt: Math.max(0, Number(e.target.value) || 0) })} /></Field>
              </div>
              <label className="check-row"><input type="checkbox" checked={s.taxIncluded} onChange={e => set({ taxIncluded: e.target.checked })} />Prices already include tax</label>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Type of business</h2></div>
            <div className="card-body">
              <select value={s.businessType} onChange={e => set({ businessType: e.target.value as Store['businessType'] })} aria-label="Type of business">
                <option value="retail">Shop (online store)</option>
                <option value="restaurant">Restaurant or café (menu, till, kitchen, reservations)</option>
                <option value="services">Services (bookings: coming soon)</option>
              </select>
              <span className="hint">This turns on the tools each kind of business needs.</span>
            </div>
          </section>
        </div>
        <aside>
          <section className="card">
            <div className="card-head"><h2>Brand</h2></div>
            <div className="card-body">
              <div className="row"><div className="brand-mark" style={{ width: 52, height: 52, fontSize: 16, borderRadius: 12, background: s.accent }}>{s.initials}</div>
                <Field label="Logo letters" htmlFor="in"><input id="in" type="text" maxLength={3} value={s.initials} onChange={e => set({ initials: e.target.value.toUpperCase() })} /></Field></div>
              <div className="field"><span className="lbl">Brand colour</span>
                <div className="row wrap" style={{ gap: 8 }}>
                  {SWATCHES.map(c => <button key={c} onClick={() => set({ accent: c })} aria-label={`Use colour ${c}`} style={{ width: 30, height: 30, borderRadius: 8, background: c, cursor: 'pointer', border: s.accent.toLowerCase() === c.toLowerCase() ? '3px solid var(--ink)' : '1px solid var(--line)' }} />)}
                  <input type="color" value={s.accent} onChange={e => set({ accent: e.target.value })} aria-label="Custom colour" style={{ width: 40, height: 32, padding: 2, border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)' }} />
                </div>
                <span className="hint">Used for the announcement bar and highlights on your website.</span>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Website connection</h2></div>
            <div className="card-body">
              <span className="hint">In Framer, open the Stockroom plugin and paste this Store ID to connect the website.</span>
              <div className="row"><input type="text" readOnly className="mono" value={data.store.id} aria-label="Store ID" /><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(data.store.id); toast('Store ID copied') } catch { toast(data.store.id) } }}>Copy</button></div>
            </div>
          </section>
          {!live && <section className="card">
            <div className="card-head"><h2>Sample data</h2></div>
            <div className="card-body">
              <span className="hint">Put the demo stores back to how they started.</span>
              <ConfirmButton className="btn" onConfirm={() => { resetDemo(); toast('Sample data reset'); setTimeout(() => location.reload(), 300) }} confirmText="Click again to reset">Reset sample data</ConfirmButton>
            </div>
          </section>}
        </aside>
      </div>
    </>
  )
}

export function Delivery() {
  const { data, update } = useData()
  const toast = useToast()
  const [zones, setZones] = useState<DeliveryZone[]>(structuredClone(data.zones))
  const [free, setFree] = useState<number | null>(data.store.freeDeliveryOver)
  const setZ = (i: number, p: Partial<DeliveryZone>) => setZones(z => z.map((x, j) => j === i ? { ...x, ...p } : x))
  const save = () => {
    if (zones.some(z => !z.name.trim())) return toast('Every zone needs a name')
    update(d => { d.zones = zones; d.store.freeDeliveryOver = free }); toast('Delivery settings saved')
  }
  return (
    <>
      <PageHead back={{ to: '/settings', label: 'Settings' }} title="Delivery" subtitle="Zones and fees shown at checkout. Customers pick their area and the fee is added."
        actions={<button className="btn primary" onClick={save}>Save</button>} />
      <section className="card">
        <div className="card-head"><h2>Delivery zones</h2><button className="btn sm" onClick={() => setZones(z => [...z, { id: uid('z'), storeId: data.store.id, name: '', areas: '', fee: 0, eta: '', active: true }])}><Plus />Add zone</button></div>
        <div className="table-wrap" style={{ marginTop: 12 }}><table>
          <thead><tr><th>Zone</th><th>Areas covered</th><th>Fee</th><th>Delivery time</th><th>On</th><th></th></tr></thead>
          <tbody>{zones.map((z, i) => (
            <tr key={z.id}>
              <td><input type="text" value={z.name} onChange={e => setZ(i, { name: e.target.value })} style={{ minWidth: 140 }} aria-label="Zone name" placeholder="e.g. Greater Accra" /></td>
              <td><input type="text" value={z.areas} onChange={e => setZ(i, { areas: e.target.value })} style={{ minWidth: 180 }} aria-label="Areas covered" /></td>
              <td><div style={{ width: 130 }}><MoneyInput value={z.fee} onChange={v => setZ(i, { fee: v ?? 0 })} /></div></td>
              <td><input type="text" value={z.eta} onChange={e => setZ(i, { eta: e.target.value })} style={{ width: 120 }} aria-label="Delivery time" placeholder="1–2 days" /></td>
              <td><Switch label="Zone on" checked={z.active} onChange={v => setZ(i, { active: v })} /></td>
              <td><button className="btn ghost sm icon" onClick={() => setZones(zs => zs.filter((_, j) => j !== i))} aria-label="Remove zone"><Trash2 /></button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Free delivery</h2><Switch label="Offer free delivery over an amount" checked={free != null} onChange={v => setFree(v ? 500 : null)} /></div>
        <div className="card-body">{free != null ? <Field label="Free delivery on orders over" htmlFor="fd"><div style={{ maxWidth: 240 }}><MoneyInput id="fd" value={free} onChange={v => setFree(v ?? 0)} /></div></Field> : <span className="hint">Turn on to waive the fee for bigger orders. You can also use a free-delivery discount code.</span>}</div>
      </section>
    </>
  )
}

const PAY_INFO: Record<PaymentProvider['key'], { name: string; desc: string }> = {
  paystack: { name: 'Paystack', desc: 'Cards, MTN MoMo, Telecel Cash, AirtelTigo Money and bank transfer. Best for customers in Ghana.' },
  flutterwave: { name: 'Flutterwave', desc: 'Cards and mobile money in several African countries. A good backup to Paystack.' },
  stripe: { name: 'Stripe', desc: 'International Visa, Mastercard and Apple Pay for customers abroad.' },
  cod: { name: 'Cash on delivery', desc: 'The customer pays the rider in cash or MoMo. You record the payment on the order.' },
}

export function Payments() {
  const { data, update, api, live } = useData()
  const [secretVal, setSecretVal] = useState('')
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  useEffect(() => { if (live) Promise.all(['paystack', 'flutterwave', 'stripe'].map(async k => [k, await api.hasSecret(`${k}_secret`)] as const)).then(r => setSaved(Object.fromEntries(r))) }, [live]) // eslint-disable-line react-hooks/exhaustive-deps
  const toast = useToast()
  const [keys, setKeys] = useState<PaymentProvider | null>(null)
  const edit = (k: PaymentProvider['key'], p: Partial<PaymentProvider>) => update(d => { const x = d.payments.find(y => y.key === k); if (x) Object.assign(x, p) })
  return (
    <>
      <PageHead back={{ to: '/settings', label: 'Settings' }} title="Payments" subtitle="How customers can pay. Online payments go straight into the store owner’s own accounts." />
      <div className="cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {data.payments.map(p => (
          <section className="card" key={p.key}>
            <div className="card-head"><h2>{PAY_INFO[p.key].name}</h2>{p.key !== 'cod' && p.enabled && <Badge tone={p.testMode ? 'warn' : 'good'}>{p.testMode ? 'Test mode' : 'Live'}</Badge>}<Switch label={`Accept ${PAY_INFO[p.key].name}`} checked={p.enabled} onChange={v => { edit(p.key, { enabled: v }); toast(`${PAY_INFO[p.key].name} ${v ? 'turned on' : 'turned off'} at checkout`) }} /></div>
            <div className="card-body">
              <p className="muted small">{PAY_INFO[p.key].desc}</p>
              {p.key === 'cod' ? <>
                <div className="field"><span className="lbl">Offer in these zones</span>
                  {data.zones.filter(z => z.name !== 'Store pickup').map(z => <label key={z.id} className="check-row"><input type="checkbox" checked={p.codZones?.includes(z.name) ?? false} onChange={e => edit('cod', { codZones: e.target.checked ? [...(p.codZones ?? []), z.name] : (p.codZones ?? []).filter(x => x !== z.name) })} />{z.name}</label>)}
                </div>
                <Field label="Extra handling fee" htmlFor="codfee"><div style={{ maxWidth: 200 }}><MoneyInput id="codfee" value={p.codFee ?? 0} onChange={v => edit('cod', { codFee: v ?? 0 })} /></div></Field>
              </> : <div className="row between"><span className="small muted">{saved[p.key] ? 'Secret key saved' : p.publicKey ? 'Public key added, secret key missing' : 'No keys yet'}</span><button className="btn sm" onClick={() => setKeys(structuredClone(p))}>Manage keys</button></div>}
            </div>
          </section>
        ))}
      </div>
      {keys && (
        <Modal title={`${PAY_INFO[keys.key].name} keys`} onClose={() => setKeys(null)} footer={<><button className="btn" onClick={() => setKeys(null)}>Cancel</button><button className="btn primary" onClick={async () => {
          try {
            if (secretVal.trim()) { await api.setSecret(`${keys.key}_secret`, secretVal.trim()); setSaved(s => ({ ...s, [keys.key]: true })) }
            edit(keys.key, { publicKey: keys.publicKey, testMode: keys.testMode }); toast('Keys saved'); setKeys(null); setSecretVal('')
          } catch (e) { toast(`Couldn’t save: ${(e as Error).message}`) }
        }}>Save</button></>}>
          <p className="muted small">Copy these from the {PAY_INFO[keys.key].name} dashboard (Settings → API keys). The secret key is stored on the server only, never in the website.</p>
          <Field label="Public key" htmlFor="pk"><input id="pk" type="text" className="mono" value={keys.publicKey} onChange={e => setKeys({ ...keys, publicKey: e.target.value })} placeholder={keys.testMode ? 'pk_test_…' : 'pk_live_…'} /></Field>
          <Field label="Secret key" hint={saved[keys.key] ? 'A secret key is saved. Leave empty to keep it, or paste a new one to replace it.' : 'Stored on the server only. It can’t be viewed again after saving.'} htmlFor="skk"><input id="skk" type="password" className="mono" placeholder="sk_…" autoComplete="off" value={secretVal} onChange={e => setSecretVal(e.target.value)} /></Field>
          {keys.key === 'paystack' && <p className="small muted">In Paystack → Settings → API Keys & Webhooks, set the Webhook URL to <span className="mono">{`${import.meta.env.VITE_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co'}/functions/v1/store-api/paystack-webhook`}</span></p>}
          <label className="check-row"><input type="checkbox" checked={keys.testMode} onChange={e => setKeys({ ...keys, testMode: e.target.checked })} />Test mode (no real money is charged)</label>
        </Modal>
      )}
    </>
  )
}

const ROLE: Record<StaffMember['role'], string> = { owner: 'Owner', admin: 'Admin (everything)', orders: 'Orders & delivery', products: 'Products & stock', marketing: 'Marketing & discounts', developer: 'Developer' }
export function Team() {
  const { data, update, api, live } = useData()
  const toast = useToast()
  const [inv, setInv] = useState<null | { name: string; email: string; role: StaffMember['role'] }>(null)
  return (
    <>
      <PageHead back={{ to: '/settings', label: 'Settings' }} title="Team" subtitle="Who can sign in to this dashboard and what they can change."
        actions={<button className="btn primary" onClick={() => setInv({ name: '', email: '', role: 'orders' })}><Plus />Invite staff</button>} />
      <section className="card">
        <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>{data.staff.map(m => (
            <tr key={m.id}>
              <td><div className="cell"><div className="avatar sm">{m.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</div><div><b style={{ fontWeight: 500 }}>{m.name}</b><div className="xs muted">{m.email}</div></div></div></td>
              <td>{m.role === 'owner' ? ROLE.owner : <select value={m.role} onChange={e => { update(d => { const x = d.staff.find(y => y.id === m.id); if (x) x.role = e.target.value as StaffMember['role'] }); toast('Role updated') }} style={{ width: 'auto' }} aria-label={`Role for ${m.name}`}>{(Object.keys(ROLE) as StaffMember['role'][]).filter(r => r !== 'owner').map(r => <option key={r} value={r}>{ROLE[r]}</option>)}</select>}</td>
              <td>{m.invited ? <Badge tone="warn">Invite sent</Badge> : <Badge tone="good">Active</Badge>}</td>
              <td className="r">{m.role !== 'owner' && <ConfirmButton className="btn sm danger" onConfirm={() => { update(d => { d.staff = d.staff.filter(x => x.id !== m.id) }); toast(`${m.name} removed`) }} confirmText="Remove?">Remove</ConfirmButton>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
      {inv && (
        <Modal title="Invite staff" onClose={() => setInv(null)} footer={<><button className="btn" onClick={() => setInv(null)}>Cancel</button><button className="btn primary" onClick={() => {
          if (!inv.name.trim() || !/\S+@\S+\.\S+/.test(inv.email)) return toast('Add a name and a valid email')
          if (!live) { update(d => { d.staff.push({ id: uid('st'), name: inv.name.trim(), email: inv.email.trim(), role: inv.role, invited: true }) }); toast('Added (sample data)'); setInv(null); return }
          api.addMember(inv.email.trim(), inv.role, inv.name.trim()).then(r => {
            if (r === 'added') { toast(`${inv.name} can now sign in to this store`); setInv(null) }
            else toast(`${inv.email} doesn’t have an account yet. Ask them to open the dashboard link, choose “Create an account”, then add them again.`)
          }).catch(e => toast(`Couldn’t add: ${(e as Error).message}`))
        }}>Send invite</button></>}>
          <Field label="Name" htmlFor="iname"><input id="iname" type="text" value={inv.name} onChange={e => setInv({ ...inv, name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="iemail"><input id="iemail" type="email" value={inv.email} onChange={e => setInv({ ...inv, email: e.target.value })} /></Field>
          <Field label="Role" htmlFor="irole"><select id="irole" value={inv.role} onChange={e => setInv({ ...inv, role: e.target.value as StaffMember['role'] })}>{(Object.keys(ROLE) as StaffMember['role'][]).filter(r => r !== 'owner').map(r => <option key={r} value={r}>{ROLE[r]}</option>)}</select></Field>
        </Modal>
      )}
    </>
  )
}
