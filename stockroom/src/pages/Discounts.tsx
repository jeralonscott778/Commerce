import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus, Copy, BadgePercent } from 'lucide-react'
import { useData, useToast } from '../data/store'
import { discountStatus, discountSummary, netTotal } from '../data/logic'
import type { Discount, DiscountType } from '../data/types'
import { PageHead, Badge, Switch, Empty, Field, MoneyInput, ConfirmButton, Tabs } from '../components/ui'
import { addDays, fDate, isoDay, money, randomCode, uid, cx } from '../lib/util'

export function Discounts() {
  const { data, update } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const [tab, setTab] = useState<'all' | 'Active' | 'Scheduled' | 'Expired'>('all')
  const colName = (id: string) => data.collections.find(c => c.id === id)?.title
  const list = data.discounts.filter(d => tab === 'all' || discountStatus(d).label === tab || (tab === 'Expired' && ['Expired', 'Used up', 'Paused'].includes(discountStatus(d).label)))
  const since = addDays(-30)
  const recent = data.orders.filter(o => new Date(o.createdAt) >= since)
  const copy = async (code: string) => { try { await navigator.clipboard.writeText(code); toast(`Copied ${code}`) } catch { toast(code) } }

  return (
    <>
      <PageHead title="Discounts" subtitle="Promo codes customers type at checkout, and automatic deals that apply by themselves."
        actions={<Link className="btn primary" to="/discounts/new"><Plus />Create discount</Link>} />
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <div className="kpi"><div className="ic"><BadgePercent /></div><div><div className="lbl">Running now</div><div className="val"><b>{data.discounts.filter(d => discountStatus(d).label === 'Active').length}</b></div></div></div>
        <div className="kpi"><div><div className="lbl">Orders with a discount (30 days)</div><div className="val"><b>{recent.filter(o => o.discountCode).length}</b></div></div></div>
        <div className="kpi"><div><div className="lbl">Sales from discounted orders</div><div className="val"><b>{money(recent.filter(o => o.discountCode).reduce((s, o) => s + netTotal(o), 0), 0)}</b></div></div></div>
      </div>
      <section className="card">
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'all', label: 'All' }, { key: 'Active', label: 'Active' }, { key: 'Scheduled', label: 'Scheduled' }, { key: 'Expired', label: 'Ended or paused' }]} />
        {list.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Discount</th><th>What customers get</th><th>Status</th><th>Used</th><th>Runs</th><th className="r">On</th></tr></thead>
            <tbody>{list.map(d => { const st = discountStatus(d); return (
              <tr key={d.id} className="click" onClick={() => nav(`/discounts/${d.id}`)}>
                <td>{d.method === 'code' ? <div className="row" style={{ gap: 4 }}><span className="code-chip">{d.code}</span><button className="btn ghost sm icon" onClick={e => { e.stopPropagation(); copy(d.code) }} aria-label={`Copy ${d.code}`}><Copy /></button></div> : <b style={{ fontWeight: 500 }}>{d.title || 'Automatic discount'}</b>}</td>
                <td className="wrap">{discountSummary(d, colName(d.appliesTo))}</td>
                <td><Badge tone={st.tone}>{st.label}</Badge></td>
                <td style={{ minWidth: 120 }}><span className="num small">{d.uses}{d.usageLimit ? ` / ${d.usageLimit}` : ''}</span>{d.usageLimit > 0 && <div className="bar"><i style={{ width: `${Math.min(100, (d.uses / d.usageLimit) * 100)}%` }} /></div>}</td>
                <td className="muted small">{fDate(d.startsAt)} – {d.endsAt ? fDate(d.endsAt) : 'no end'}</td>
                <td className="r" onClick={e => e.stopPropagation()}><Switch label={`Turn ${d.code || d.title} on or off`} checked={!d.paused} onChange={v => { update(x => { const y = x.discounts.find(z => z.id === d.id); if (y) y.paused = !v }); toast(`${d.code || d.title} ${v ? 'turned on' : 'paused'}`) }} /></td>
              </tr>) })}</tbody>
          </table></div>
        ) : <Empty title="No discounts here" icon={<BadgePercent />} />}
      </section>
    </>
  )
}

const TYPES: { key: DiscountType; label: string; hint: string }[] = [
  { key: 'percent', label: 'Percentage off', hint: 'e.g. 10% off' },
  { key: 'fixed', label: 'Amount off', hint: 'e.g. GH₵50 off' },
  { key: 'free_delivery', label: 'Free delivery', hint: 'No delivery fee' },
  { key: 'buy_x_get_y', label: 'Buy X get Y', hint: 'e.g. buy 2 get 1 free' },
]

export function DiscountEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const { data, update } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const existing = data.discounts.find(d => d.id === id)
  const [d, setD] = useState<Discount>(() => existing ? structuredClone(existing) : {
    id: '', storeId: data.store.id, method: 'code', code: randomCode(6), title: '', type: 'percent', value: 10, buyQty: 2, getQty: 1, appliesTo: 'all',
    minSpend: 0, eligibility: 'everyone', usageLimit: 0, oncePerCustomer: true, startsAt: isoDay(new Date()), endsAt: '', paused: false, uses: 0,
  })
  if (!isNew && !existing) return <><PageHead title="Discount not found" back={{ to: '/discounts', label: 'Discounts' }} /><Empty title="This discount doesn't exist or was deleted." /></>
  const set = (p: Partial<Discount>) => setD(x => ({ ...x, ...p }))
  const st = discountStatus(d)
  const colName = data.collections.find(c => c.id === d.appliesTo)?.title
  const cart = Math.max(500, d.minSpend || 0)
  const saving = d.type === 'percent' ? cart * (d.value || 0) / 100 : d.type === 'fixed' ? Math.min(cart, d.value || 0) : d.type === 'free_delivery' ? (data.zones[0]?.fee ?? 0) : 0

  const save = () => {
    const x = { ...d, code: d.method === 'code' ? d.code.toUpperCase().replace(/[^A-Z0-9]/g, '') : '' }
    if (x.method === 'code' && !x.code) return toast('Enter a code, or switch to Automatic')
    if (x.method === 'automatic' && !x.title.trim()) return toast('Give the automatic discount a name customers will see')
    if (x.method === 'code' && data.discounts.some(y => y.code === x.code && y.id !== x.id)) return toast(`${x.code} already exists. Choose another code.`)
    if ((x.type === 'percent' || x.type === 'fixed') && !(x.value > 0)) return toast('Enter how much the discount is worth')
    if (x.type === 'percent' && x.value > 100) return toast('A percentage can’t be more than 100')
    if (x.endsAt && x.endsAt < x.startsAt) return toast('The end date is before the start date')
    const final = { ...x, id: x.id || uid('ds') }
    update(s => { const i = s.discounts.findIndex(y => y.id === final.id); if (i >= 0) s.discounts[i] = final; else s.discounts.unshift(final) })
    toast(isNew ? (final.code ? `${final.code} is ready to use at checkout` : 'Automatic discount created') : 'Discount saved')
    nav('/discounts')
  }

  return (
    <>
      <PageHead back={{ to: '/discounts', label: 'Discounts' }} title={isNew ? 'Create discount' : d.code || d.title}
        actions={<>{!isNew && <ConfirmButton onConfirm={() => { update(s => { s.discounts = s.discounts.filter(y => y.id !== d.id) }); toast('Discount deleted'); nav('/discounts') }} confirmText="Click again to delete">Delete</ConfirmButton>}<button className="btn primary" onClick={save}>Save</button></>} />
      <div className="two-col">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Method</h2></div>
            <div className="card-body">
              <div className="radio-cards">
                {(['code', 'automatic'] as const).map(m => (
                  <label key={m} className={cx('radio-card', d.method === m && 'on')}><input type="radio" name="method" checked={d.method === m} onChange={() => set({ method: m })} /><span><b>{m === 'code' ? 'Promo code' : 'Automatic'}</b><small>{m === 'code' ? 'Customer types a code at checkout' : 'Applies by itself when conditions are met'}</small></span></label>
                ))}
              </div>
              {d.method === 'code'
                ? <Field label="Code" hint="Letters and numbers only. Not case-sensitive." htmlFor="code"><div className="row"><input id="code" type="text" className="mono" style={{ textTransform: 'uppercase' }} value={d.code} onChange={e => set({ code: e.target.value.toUpperCase() })} /><button className="btn" onClick={() => set({ code: randomCode(6) })}>Generate</button></div></Field>
                : <Field label="Name customers see" hint="Shown in the cart and at checkout." htmlFor="title"><input id="title" type="text" value={d.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Buy 2 get 1 free on serums" /></Field>}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Discount</h2></div>
            <div className="card-body">
              <div className="radio-cards">
                {TYPES.map(t => <label key={t.key} className={cx('radio-card', d.type === t.key && 'on')}><input type="radio" name="type" checked={d.type === t.key} onChange={() => set({ type: t.key })} /><span><b>{t.label}</b><small>{t.hint}</small></span></label>)}
              </div>
              {d.type === 'percent' && <Field label="Percentage off" htmlFor="pv"><div className="input-group" style={{ maxWidth: 200 }}><input id="pv" type="number" min={1} max={100} value={d.value || ''} onChange={e => set({ value: Number(e.target.value) })} /><span>%</span></div></Field>}
              {d.type === 'fixed' && <Field label="Amount off the order" htmlFor="fv"><div style={{ maxWidth: 220 }}><MoneyInput id="fv" value={d.value || null} onChange={v => set({ value: v ?? 0 })} /></div></Field>}
              {d.type === 'buy_x_get_y' && <div className="grid2" style={{ maxWidth: 380 }}><Field label="Customer buys" htmlFor="bq"><input id="bq" type="number" min={1} value={d.buyQty} onChange={e => set({ buyQty: Math.max(1, Number(e.target.value) || 1) })} /></Field><Field label="Gets free" htmlFor="gq"><input id="gq" type="number" min={1} value={d.getQty} onChange={e => set({ getQty: Math.max(1, Number(e.target.value) || 1) })} /></Field></div>}
              {d.type === 'buy_x_get_y' && <span className="hint">The cheapest qualifying items are the free ones.</span>}
              {d.type !== 'free_delivery' && <Field label="Applies to" htmlFor="ap"><select id="ap" value={d.appliesTo} onChange={e => set({ appliesTo: e.target.value })}><option value="all">All products</option>{data.collections.map(c => <option key={c.id} value={c.id}>Collection: {c.title}</option>)}</select></Field>}
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Conditions</h2></div>
            <div className="card-body">
              <Field label="Minimum order amount" hint="Leave empty for no minimum." htmlFor="min"><div style={{ maxWidth: 240 }}><MoneyInput id="min" value={d.minSpend || null} onChange={v => set({ minSpend: v ?? 0 })} placeholder="No minimum" /></div></Field>
              <div className="field"><span className="lbl">Who can use it</span>
                <label className="check-row"><input type="radio" name="el" checked={d.eligibility === 'everyone'} onChange={() => set({ eligibility: 'everyone' })} />Everyone</label>
                <label className="check-row"><input type="radio" name="el" checked={d.eligibility === 'first_order'} onChange={() => set({ eligibility: 'first_order' })} />First-time customers only</label>
              </div>
              <div className="grid2">
                <Field label="Total number of uses" hint="Leave empty for unlimited." htmlFor="lim"><input id="lim" type="number" min={0} value={d.usageLimit || ''} placeholder="Unlimited" onChange={e => set({ usageLimit: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                <label className="check-row" style={{ alignSelf: 'center' }}><input type="checkbox" checked={d.oncePerCustomer} onChange={e => set({ oncePerCustomer: e.target.checked })} />One use per customer</label>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Dates</h2></div>
            <div className="card-body grid2">
              <Field label="Starts" htmlFor="sd"><input id="sd" type="date" value={d.startsAt} onChange={e => set({ startsAt: e.target.value })} /></Field>
              <Field label="Ends" hint="Leave empty to run until you turn it off." htmlFor="ed"><input id="ed" type="date" value={d.endsAt} onChange={e => set({ endsAt: e.target.value })} /></Field>
            </div>
          </section>
        </div>
        <aside>
          <section className="card">
            <div className="card-head"><h2>Summary</h2><Badge tone={st.tone}>{st.label}</Badge></div>
            <div className="card-body">
              <div style={{ fontSize: 22, fontWeight: 700, wordBreak: 'break-all' }} className={d.method === 'code' ? 'mono' : ''}>{d.method === 'code' ? (d.code || '—').toUpperCase() : d.title || 'Automatic discount'}</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                <li>{discountSummary(d, colName)}</li>
                <li>{d.usageLimit ? `Stops after ${d.usageLimit} uses` : 'No usage limit'}</li>
                <li>{d.oncePerCustomer ? 'One use per customer' : 'Customers can reuse it'}</li>
                <li>{fDate(d.startsAt)} – {d.endsAt ? fDate(d.endsAt) : 'no end date'}</li>
              </ul>
              {d.type !== 'buy_x_get_y' && <div className="small" style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>Example: on a {money(cart, 0)} order the customer saves <b>{money(saving)}</b>.</div>}
              {!isNew && <span className="small muted">Used {d.uses} times so far.</span>}
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
