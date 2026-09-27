import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Gift, Boxes, Layers, Copy } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import { fullName } from '../../data/logic'
import type { Collection, GiftCard } from '../../data/types'
import { PageHead, SearchBox, Tabs, Empty, Thumb, Badge, Modal, Field, Switch, ConfirmButton, MoneyInput } from '../../components/ui'
import { fDate, money, randomCode, slug, uid, isoDay, addDays } from '../../lib/util'

// ---------- Collections ----------
export function Collections() {
  const { data, update } = useData()
  const toast = useToast()
  const [edit, setEdit] = useState<Collection | null>(null)

  const save = () => {
    if (!edit) return
    if (!edit.title.trim()) return toast('Give the collection a name')
    const isNew = !edit.id
    const c = { ...edit, id: edit.id || uid('c'), handle: edit.handle || slug(edit.title) }
    update(d => { const i = d.collections.findIndex(x => x.id === c.id); if (i >= 0) d.collections[i] = c; else d.collections.push(c) })
    toast(isNew ? `Collection “${c.title}” created` : 'Collection saved'); setEdit(null)
  }
  const del = (c: Collection) => {
    update(d => { d.collections = d.collections.filter(x => x.id !== c.id); d.products.forEach(p => { p.collectionIds = p.collectionIds.filter(x => x !== c.id) }) })
    toast(`Collection “${c.title}” deleted. Products were kept.`); setEdit(null)
  }

  return (
    <>
      <PageHead title="Collections" subtitle="Group products for your website menu and category pages, like “New in” or “Serums”."
        actions={<button className="btn primary" onClick={() => setEdit({ id: '', storeId: data.store.id, title: '', description: '', visible: true, handle: '' })}><Plus />Create collection</button>} />
      <section className="card">
        {data.collections.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Collection</th><th>Products</th><th>Web address</th><th className="r">On website</th></tr></thead>
            <tbody>{data.collections.map(c => {
              const ps = data.products.filter(p => p.collectionIds.includes(c.id))
              return (
                <tr key={c.id} className="click" onClick={() => setEdit(structuredClone(c))}>
                  <td><div className="cell"><div className="row" style={{ gap: 0 }}>{ps.slice(0, 3).map((p, i) => <div key={p.id} style={{ marginLeft: i ? -12 : 0 }}><Thumb title={p.title} hue={p.hue} image={p.images[0]} size="sm" /></div>)}{!ps.length && <div className="thumb sm" style={{ ['--h' as string]: 220, opacity: .35 }}>—</div>}</div><b>{c.title}</b></div></td>
                  <td className="muted">{ps.length}</td>
                  <td className="muted mono">/collections/{c.handle}</td>
                  <td className="r" onClick={e => e.stopPropagation()}><Switch label={`Show ${c.title} on website`} checked={c.visible} onChange={v => { update(d => { const x = d.collections.find(y => y.id === c.id); if (x) x.visible = v }); toast(`${c.title} ${v ? 'shown on' : 'hidden from'} your website`) }} /></td>
                </tr>
              )
            })}</tbody>
          </table></div>
        ) : <Empty title="No collections yet" icon={<Layers />} />}
      </section>
      {edit && (
        <Modal title={edit.id ? 'Edit collection' : 'Create collection'} onClose={() => setEdit(null)}
          footer={<>{edit.id && <ConfirmButton onConfirm={() => del(edit)} confirmText="Click again to delete">Delete</ConfirmButton>}<span className="grow" /><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          <Field label="Name" htmlFor="cn"><input id="cn" type="text" autoFocus value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="Description" hint="Optional. Shown at the top of the collection page." htmlFor="cd"><textarea id="cd" rows={3} value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} /></Field>
          <label className="check-row"><input type="checkbox" checked={edit.visible} onChange={e => setEdit({ ...edit, visible: e.target.checked })} />Show on website</label>
          {edit.id && <p className="small muted">To add products, open a product and tick this collection, or select products on the Products page and use “Add to collection”.</p>}
        </Modal>
      )}
    </>
  )
}

// ---------- Inventory ----------
export function Inventory() {
  const { data, update } = useData()
  const toast = useToast()
  const [tab, setTab] = useState<'all' | 'low' | 'out'>('all')
  const [q, setQ] = useState('')
  const low = data.store.lowStockAt
  const rows = data.products.filter(p => p.status !== 'archived').flatMap(p => p.variants.filter(v => v.trackStock).map((v, i) => ({ p, v, i })))
  const f = { all: () => true, low: (x: typeof rows[number]) => x.v.stock > 0 && x.v.stock <= low, out: (x: typeof rows[number]) => x.v.stock === 0 }
  const list = rows.filter(f[tab]).filter(x => !q || `${x.p.title} ${x.v.title} ${x.v.sku}`.toLowerCase().includes(q.toLowerCase()))

  const setStock = (pid: string, vid: string, n: number) => update(d => {
    const v = d.products.find(p => p.id === pid)?.variants.find(x => x.id === vid); if (v) v.stock = Math.max(0, n)
  })

  return (
    <>
      <PageHead title="Inventory" subtitle={`Update stock after a delivery or a stock count. Items at ${low} or fewer are flagged as low (change this in Settings).`} />
      <section className="card">
        <Tabs value={tab} onChange={setTab} tabs={[{ key: 'all', label: 'All', count: rows.length }, { key: 'low', label: 'Low stock', count: rows.filter(f.low).length }, { key: 'out', label: 'Out of stock', count: rows.filter(f.out).length }]} />
        <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Search product, variant or SKU" /></div>
        {list.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Product</th><th>SKU</th><th>Status</th><th className="r">Available</th></tr></thead>
            <tbody>{list.map(({ p, v }) => (
              <tr key={v.id}>
                <td><div className="cell"><Thumb title={p.title} hue={p.hue} image={p.images[0]} size="sm" /><div><Link to={`/products/${p.id}`} style={{ fontWeight: 500 }}>{p.title}</Link><div className="small muted">{v.title}</div></div></div></td>
                <td className="mono muted">{v.sku}</td>
                <td>{v.stock === 0 ? <Badge tone="bad">Out of stock</Badge> : v.stock <= low ? <Badge tone="warn">Low</Badge> : <Badge tone="good">In stock</Badge>}</td>
                <td className="r">
                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <button className="btn sm icon" onClick={() => setStock(p.id, v.id, v.stock - 1)} aria-label="Decrease">−</button>
                    <input type="number" min={0} value={v.stock} style={{ width: 76, height: 32, textAlign: 'center' }} aria-label={`Stock for ${p.title} ${v.title}`} onChange={e => setStock(p.id, v.id, Number(e.target.value) || 0)} onBlur={() => toast('Stock updated')} />
                    <button className="btn sm icon" onClick={() => setStock(p.id, v.id, v.stock + 1)} aria-label="Increase">+</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty title={tab === 'all' ? 'No stock to track' : 'Nothing here. Stock looks healthy.'} icon={<Boxes />} />}
      </section>
    </>
  )
}

// ---------- Gift cards ----------
export function GiftCards() {
  const { data, update } = useData()
  const toast = useToast()
  const [issue, setIssue] = useState<null | { value: number | null; customerId: string; expires: string; note: string; code: string }>(null)
  const [view, setView] = useState<GiftCard | null>(null)
  const [adjust, setAdjust] = useState<number | null>(null)
  const status = (g: GiftCard) => g.disabled ? { l: 'Disabled', t: 'neutral' as const } : g.expiresAt && g.expiresAt < isoDay(new Date()) ? { l: 'Expired', t: 'neutral' as const } : g.balance <= 0 ? { l: 'Used up', t: 'neutral' as const } : { l: 'Active', t: 'good' as const }
  const outstanding = data.giftCards.filter(g => status(g).l === 'Active').reduce((s, g) => s + g.balance, 0)

  const create = () => {
    if (!issue || !(issue.value && issue.value > 0)) return toast('Enter the gift card value')
    const cu = data.customers.find(c => c.id === issue.customerId)
    const g: GiftCard = { id: uid('g'), storeId: data.store.id, code: issue.code, initialValue: issue.value, balance: issue.value, customerId: cu?.id ?? null, customerName: cu ? fullName(cu) : '', expiresAt: issue.expires, disabled: false, note: issue.note, createdAt: new Date().toISOString() }
    update(d => { d.giftCards.unshift(g) })
    toast(`Gift card ${g.code} issued for ${money(g.initialValue)}`); setIssue(null)
  }
  const copy = async (code: string) => { try { await navigator.clipboard.writeText(code); toast(`Copied ${code}`) } catch { toast(code) } }
  const newCode = () => `GIFT-${randomCode(4)}-${randomCode(4)}`

  return (
    <>
      <PageHead title="Gift cards" subtitle="Sell or give store credit. Customers enter the code at checkout, and staff can use it on manual orders."
        actions={<button className="btn primary" onClick={() => setIssue({ value: 200, customerId: '', expires: isoDay(addDays(365)), note: '', code: newCode() })}><Plus />Issue gift card</button>} />
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
        <div className="kpi"><div><div className="lbl">Active cards</div><div className="val"><b>{data.giftCards.filter(g => status(g).l === 'Active').length}</b></div></div></div>
        <div className="kpi"><div><div className="lbl">Unspent balance</div><div className="val"><b>{money(outstanding, 0)}</b></div></div></div>
        <div className="kpi"><div><div className="lbl">Issued in total</div><div className="val"><b>{money(data.giftCards.reduce((s, g) => s + g.initialValue, 0), 0)}</b></div></div></div>
      </div>
      <section className="card">
        {data.giftCards.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Code</th><th>Status</th><th>Customer</th><th className="r">Balance</th><th>Expires</th><th>Created</th></tr></thead>
            <tbody>{data.giftCards.map(g => { const s = status(g); return (
              <tr key={g.id} className="click" onClick={() => { setView(g); setAdjust(g.balance) }}>
                <td><span className="code-chip">{g.code}</span></td>
                <td><Badge tone={s.t}>{s.l}</Badge></td>
                <td>{g.customerName || <span className="faint">Not assigned</span>}</td>
                <td className="r num">{money(g.balance)} <span className="faint small">of {money(g.initialValue, 0)}</span></td>
                <td className="muted">{g.expiresAt ? fDate(g.expiresAt) : 'Never'}</td>
                <td className="muted">{fDate(g.createdAt)}</td>
              </tr>) })}</tbody>
          </table></div>
        ) : <Empty title="No gift cards yet" icon={<Gift />} />}
      </section>

      {issue && (
        <Modal title="Issue gift card" onClose={() => setIssue(null)} footer={<><button className="btn" onClick={() => setIssue(null)}>Cancel</button><button className="btn primary" onClick={create}>Issue gift card</button></>}>
          <Field label="Code" hint="Customers type this at checkout." htmlFor="gcode"><div className="row"><input id="gcode" type="text" className="mono" value={issue.code} onChange={e => setIssue({ ...issue, code: e.target.value.toUpperCase() })} /><button className="btn" onClick={() => setIssue({ ...issue, code: newCode() })}>New code</button></div></Field>
          <Field label="Value" htmlFor="gval"><MoneyInput id="gval" value={issue.value} onChange={v => setIssue({ ...issue, value: v })} /></Field>
          <Field label="Customer" hint="Optional" htmlFor="gcu"><select id="gcu" value={issue.customerId} onChange={e => setIssue({ ...issue, customerId: e.target.value })}><option value="">Not assigned</option>{data.customers.map(c => <option key={c.id} value={c.id}>{fullName(c)} · {c.phone}</option>)}</select></Field>
          <Field label="Expires" hint="Leave empty for no expiry." htmlFor="gexp"><input id="gexp" type="date" value={issue.expires} onChange={e => setIssue({ ...issue, expires: e.target.value })} /></Field>
          <Field label="Note" hint="Only your team sees this." htmlFor="gnote"><input id="gnote" type="text" value={issue.note} onChange={e => setIssue({ ...issue, note: e.target.value })} placeholder="e.g. Refund as store credit" /></Field>
        </Modal>
      )}
      {view && (
        <Modal title={view.code} onClose={() => setView(null)} footer={<>
          <button className="btn" onClick={() => { update(d => { const x = d.giftCards.find(y => y.id === view.id); if (x) x.disabled = !x.disabled }); toast(view.disabled ? 'Gift card re-enabled' : 'Gift card disabled'); setView(null) }}>{view.disabled ? 'Enable' : 'Disable'}</button>
          <span className="grow" />
          <button className="btn" onClick={() => copy(view.code)}><Copy />Copy code</button>
          <button className="btn primary" onClick={() => { update(d => { const x = d.giftCards.find(y => y.id === view.id); if (x) x.balance = Math.max(0, adjust ?? x.balance) }); toast('Balance updated'); setView(null) }}>Save balance</button>
        </>}>
          <dl className="kv"><dt>Issued</dt><dd>{money(view.initialValue)} on {fDate(view.createdAt)}</dd><dt>Customer</dt><dd>{view.customerName || '—'}</dd><dt>Expires</dt><dd>{view.expiresAt ? fDate(view.expiresAt) : 'Never'}</dd>{view.note && <><dt>Note</dt><dd>{view.note}</dd></>}</dl>
          <Field label="Balance" hint="Adjust if you gave credit or corrected a mistake." htmlFor="gbal"><MoneyInput id="gbal" value={adjust} onChange={setAdjust} /></Field>
          <div className="small muted">Used on orders: {data.orders.filter(o => o.giftCardCode === view.code).map(o => <Link key={o.id} to={`/orders/${o.id}`} style={{ marginRight: 8 }}>#{o.number}</Link>)}{!data.orders.some(o => o.giftCardCode === view.code) && 'none yet'}</div>
        </Modal>
      )}
    </>
  )
}
