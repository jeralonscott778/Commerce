import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Upload, Download, Users, Trash2 } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import { customerStats, customersToRows, describeRule, fullName, inSegment, rowsToCustomers } from '../../data/logic'
import type { Segment, SegmentRule } from '../../data/types'
import { PageHead, SearchBox, Tabs, useSelection, CheckAll, Empty, Badge, Modal, Field, ConfirmButton } from '../../components/ui'
import { downloadFile, isoDay, money, parseCSV, readFileText, toCSV, uid, fDate } from '../../lib/util'

export default function Customers() {
  const { data, update } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const [seg, setSeg] = useState('all')
  const [q, setQ] = useState('')
  const [segModal, setSegModal] = useState(false)
  const [importing, setImporting] = useState(false)
  const [tagModal, setTagModal] = useState(false)
  const [tag, setTag] = useState('')
  const stats = useMemo(() => customerStats(data), [data])
  const segment = data.segments.find(s => s.id === seg)

  const list = useMemo(() => data.customers
    .filter(c => !segment || inSegment(c, stats.get(c.id), segment))
    .filter(c => !q || `${fullName(c)} ${c.email} ${c.phone} ${c.address.city} ${c.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (stats.get(b.id)?.spent ?? 0) - (stats.get(a.id)?.spent ?? 0)), [data.customers, segment, q, stats])
  const sel = useSelection(list.map(c => c.id))

  const exportCSV = (cs: typeof list, name = 'customers') => {
    if (!cs.length) return toast('No customers to export')
    downloadFile(`${name}-${isoDay(new Date())}.csv`, toCSV(customersToRows(data, cs))); toast(`Exported ${cs.length} customers`)
  }

  return (
    <>
      <PageHead title="Customers" subtitle="Everyone who has ordered or been added by your team."
        actions={<>
          <button className="btn soft" onClick={() => setImporting(true)}><Upload />Import</button>
          <button className="btn soft" onClick={() => exportCSV(list)}><Download />Export</button>
          <Link className="btn primary" to="/customers/new"><Plus />Add customer</Link>
        </>} />
      <section className="card">
        <Tabs value={seg} onChange={v => { setSeg(v); sel.clear() }} tabs={[{ key: 'all', label: 'All customers', count: data.customers.length }, ...data.segments.map(s => ({ key: s.id, label: s.name, count: data.customers.filter(c => inSegment(c, stats.get(c.id), s)).length }))]} />
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, phone, email, city or tag" />
          <span className="grow" />
          {segment && <span className="small muted">{describeRule(segment)}</span>}
          {segment && <ConfirmButton className="btn sm ghost danger" confirmText="Delete segment?" onConfirm={() => { update(d => { d.segments = d.segments.filter(s => s.id !== segment.id) }); setSeg('all'); toast('Segment deleted') }}><Trash2 size={14} /></ConfirmButton>}
          <button className="btn sm" onClick={() => setSegModal(true)}><Plus />New segment</button>
        </div>
        {sel.selected.length > 0 && (
          <div className="bulkbar">
            <b>{sel.selected.length} selected</b>
            <button className="btn sm" onClick={() => setTagModal(true)}>Add tag</button>
            <button className="btn sm" onClick={() => exportCSV(data.customers.filter(c => sel.selected.includes(c.id)), 'customers-selected')}>Export</button>
            <ConfirmButton className="btn sm danger" confirmText="Click again to delete" onConfirm={() => { const n = sel.selected.length; update(d => { d.customers = d.customers.filter(c => !sel.selected.includes(c.id)) }); toast(`${n} customers deleted. Their orders were kept.`); sel.clear() }}>Delete</ConfirmButton>
          </div>
        )}
        {list.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th className="check"><CheckAll all={sel.all} some={sel.some} onChange={sel.toggleAll} /></th><th>Customer</th><th>Marketing</th><th>Location</th><th className="r">Orders</th><th className="r">Amount spent</th><th>Last order</th></tr></thead>
            <tbody>{list.map(c => { const s = stats.get(c.id); return (
              <tr key={c.id} className={'click' + (sel.has(c.id) ? ' selected' : '')} onClick={() => nav(`/customers/${c.id}`)}>
                <td className="check" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(c.id)} onChange={() => sel.toggle(c.id)} aria-label={`Select ${fullName(c)}`} /></td>
                <td><div className="cell"><div className="avatar sm">{(c.firstName[0] ?? '') + (c.lastName[0] ?? '')}</div><div><b style={{ fontWeight: 500 }}>{fullName(c)}</b>{c.tags.includes('VIP') && <> <Badge tone="info" plain>VIP</Badge></>}<div className="xs muted">{c.phone}</div></div></div></td>
                <td>{c.acceptsWhatsApp || c.acceptsEmail ? <div className="row" style={{ gap: 4 }}>{c.acceptsWhatsApp && <Badge tone="good" plain>WhatsApp</Badge>}{c.acceptsEmail && <Badge tone="good" plain>Email</Badge>}</div> : <Badge plain>Not subscribed</Badge>}</td>
                <td className="muted">{c.address.city ? `${c.address.city}, ${c.address.country}` : '—'}</td>
                <td className="r num">{s?.orders ?? 0}</td>
                <td className="r num">{money(s?.spent ?? 0)}</td>
                <td className="muted">{s?.lastOrder ? fDate(s.lastOrder) : '—'}</td>
              </tr>) })}</tbody>
          </table></div>
        ) : <Empty title="No customers match" icon={<Users />} />}
      </section>
      {segModal && <SegmentModal onClose={() => setSegModal(false)} onSave={s => { update(d => { d.segments.push(s) }); setSeg(s.id); setSegModal(false); toast(`Segment “${s.name}” created`) }} storeId={data.store.id} />}
      {importing && <ImportCustomers onClose={() => setImporting(false)} />}
      {tagModal && (
        <Modal title="Add a tag" onClose={() => setTagModal(false)} footer={<><button className="btn" onClick={() => setTagModal(false)}>Cancel</button><button className="btn primary" onClick={() => { const t = tag.trim(); if (!t) return; update(d => d.customers.forEach(c => { if (sel.selected.includes(c.id) && !c.tags.includes(t)) c.tags.push(t) })); toast(`Tagged ${sel.selected.length} customers`); setTag(''); setTagModal(false); sel.clear() }}>Add tag</button></>}>
          <input type="text" autoFocus value={tag} onChange={e => setTag(e.target.value)} placeholder="e.g. VIP, wholesale" aria-label="Tag" />
        </Modal>
      )}
    </>
  )
}

function SegmentModal({ onClose, onSave, storeId }: { onClose: () => void; onSave: (s: Segment) => void; storeId: string }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SegmentRule['kind']>('spent_over')
  const [val, setVal] = useState('1000')
  const needs = kind !== 'accepts_marketing'
  const rule = (): SegmentRule => {
    switch (kind) {
      case 'spent_over': return { kind, amount: Number(val) || 0 }
      case 'orders_at_least': return { kind, count: Number(val) || 1 }
      case 'no_order_days': return { kind, days: Number(val) || 30 }
      case 'city': return { kind, city: val }
      case 'tag': return { kind, tag: val }
      default: return { kind: 'accepts_marketing' }
    }
  }
  const placeholder = { spent_over: 'Amount, e.g. 1000', orders_at_least: 'Number of orders, e.g. 3', no_order_days: 'Days, e.g. 60', city: 'City or region, e.g. Kumasi', tag: 'Tag, e.g. VIP', accepts_marketing: '' }[kind]
  return (
    <Modal title="New customer segment" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!name.trim() || (needs && !val.trim())} onClick={() => onSave({ id: uid('s'), storeId, name: name.trim(), rule: rule() })}>Save segment</button></>}>
      <p className="muted">A segment is a saved list of customers that updates by itself, e.g. to send an offer to people who haven’t ordered in a while.</p>
      <Field label="Name" htmlFor="sn"><input id="sn" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Loyal customers" /></Field>
      <Field label="Customers who…" htmlFor="sk">
        <select id="sk" value={kind} onChange={e => { const k = e.target.value as SegmentRule['kind']; setKind(k); setVal(k === 'spent_over' ? '1000' : k === 'orders_at_least' ? '3' : k === 'no_order_days' ? '60' : '') }}>
          <option value="spent_over">have spent at least…</option><option value="orders_at_least">have placed at least … orders</option>
          <option value="no_order_days">haven’t ordered in … days</option><option value="city">live in…</option>
          <option value="tag">have the tag…</option><option value="accepts_marketing">agreed to receive offers</option>
        </select>
      </Field>
      {needs && <input type={['city', 'tag'].includes(kind) ? 'text' : 'number'} value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder} aria-label="Value" />}
    </Modal>
  )
}

function ImportCustomers({ onClose }: { onClose: () => void }) {
  const { update } = useData()
  const toast = useToast()
  const [rows, setRows] = useState<Record<string, string>[] | null>(null)
  const [err, setErr] = useState('')
  const onFile = async (f?: File) => {
    if (!f) return
    setErr('')
    try {
      const r = parseCSV(await readFileText(f))
      if (!r.length || !('Phone' in r[0] || 'Email' in r[0])) { setErr('The file needs a “Phone” or “Email” column. Download the template to see the format.'); return setRows(null) }
      setRows(r)
    } catch { setErr('Couldn’t read that file. Save it as CSV and try again.') }
  }
  return (
    <Modal title="Import customers" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!rows} onClick={() => { let r = { created: 0, updated: 0 }; update(d => { r = rowsToCustomers(d, rows!) }); toast(`Imported ${rows!.length} customers`); void r; onClose() }}>Import {rows ? rows.length : ''} customers</button></>}>
      <p className="muted">Upload a CSV. Customers with a matching phone number or email are updated instead of duplicated.</p>
      <input type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0])} aria-label="CSV file" />
      {rows && <p className="small">{rows.length} rows found.</p>}
      {err && <p className="error">{err}</p>}
      <button className="btn sm ghost" style={{ justifySelf: 'start' }} onClick={() => downloadFile('customer-import-template.csv', toCSV([{ 'First name': 'Ama', 'Last name': 'Owusu', Email: 'ama@example.com', Phone: '+233 24 000 0000', Address: '12 Oxford St', City: 'Accra', Region: 'Greater Accra', Country: 'Ghana', 'Accepts email': 'yes', 'Accepts WhatsApp': 'yes', Tags: 'VIP', Note: '' }]))}><Download />Download a template</button>
    </Modal>
  )
}
