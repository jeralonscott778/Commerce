import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Upload, Download, Tag } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import { productsToRows, rowsToProducts, stockOf } from '../../data/logic'
import type { Product } from '../../data/types'
import { PageHead, SearchBox, Tabs, useSelection, CheckAll, Empty, Thumb, Badge, Modal, ConfirmButton } from '../../components/ui'
import { downloadFile, isoDay, parseCSV, readFileText, toCSV } from '../../lib/util'

type TabKey = 'all' | 'active' | 'draft' | 'archived'

export default function Products() {
  const { data, update } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const [tab, setTab] = useState<TabKey>('all')
  const [q, setQ] = useState('')
  const [col, setCol] = useState('all')
  const [importing, setImporting] = useState(false)
  const [colModal, setColModal] = useState(false)
  const [colPick, setColPick] = useState('')

  const list = useMemo(() => data.products.filter(p => (tab === 'all' ? p.status !== 'archived' : p.status === tab))
    .filter(p => col === 'all' || p.collectionIds.includes(col))
    .filter(p => !q || `${p.title} ${p.vendor} ${p.productType} ${p.tags.join(' ')} ${p.variants.map(v => v.sku).join(' ')}`.toLowerCase().includes(q.toLowerCase())), [data.products, tab, col, q])
  const sel = useSelection(list.map(p => p.id))

  const setStatus = (s: Product['status']) => {
    update(d => d.products.forEach(p => { if (sel.selected.includes(p.id)) { p.status = s; p.updatedAt = new Date().toISOString() } }))
    toast(`${sel.selected.length} product${sel.selected.length > 1 ? 's' : ''} ${s === 'active' ? 'published to your website' : s === 'draft' ? 'set to draft (hidden)' : 'archived'}`)
    sel.clear()
  }
  const del = () => {
    const n = sel.selected.length
    update(d => { d.products = d.products.filter(p => !sel.selected.includes(p.id)) })
    toast(`${n} product${n > 1 ? 's' : ''} deleted`); sel.clear()
  }
  const addToCollection = () => {
    if (!colPick) return
    update(d => d.products.forEach(p => { if (sel.selected.includes(p.id) && !p.collectionIds.includes(colPick)) p.collectionIds.push(colPick) }))
    toast(`Added to ${data.collections.find(c => c.id === colPick)?.title}`); setColModal(false); sel.clear()
  }
  const exportCSV = (ps: Product[]) => {
    if (!ps.length) return toast('No products to export')
    downloadFile(`products-${isoDay(new Date())}.csv`, toCSV(productsToRows(data, ps)))
    toast(`Exported ${ps.length} products`)
  }

  const count = (k: TabKey) => data.products.filter(p => (k === 'all' ? p.status !== 'archived' : p.status === k)).length

  return (
    <>
      <PageHead title="Products" subtitle="Everything you sell. Saved changes show on your website straight away."
        actions={<>
          <button className="btn soft" onClick={() => setImporting(true)}><Upload />Import</button>
          <button className="btn soft" onClick={() => exportCSV(list)}><Download />Export</button>
          <Link className="btn primary" to="/products/new"><Plus />Add product</Link>
        </>} />
      <section className="card">
        <Tabs value={tab} onChange={t => { setTab(t); sel.clear() }} tabs={[{ key: 'all', label: 'All', count: count('all') }, { key: 'active', label: 'Active', count: count('active') }, { key: 'draft', label: 'Draft', count: count('draft') }, { key: 'archived', label: 'Archived', count: count('archived') }]} />
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search products, SKU, vendor or tag" />
          <select value={col} onChange={e => setCol(e.target.value)} style={{ width: 'auto' }} aria-label="Collection"><option value="all">All collections</option>{data.collections.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        </div>
        {sel.selected.length > 0 && (
          <div className="bulkbar">
            <b>{sel.selected.length} selected</b>
            <button className="btn sm" onClick={() => setStatus('active')}>Set as active</button>
            <button className="btn sm" onClick={() => setStatus('draft')}>Set as draft</button>
            <button className="btn sm" onClick={() => setStatus('archived')}>Archive</button>
            <button className="btn sm" onClick={() => setColModal(true)}>Add to collection</button>
            <button className="btn sm" onClick={() => exportCSV(data.products.filter(p => sel.selected.includes(p.id)))}>Export</button>
            <ConfirmButton className="btn sm danger" onConfirm={del} confirmText="Click again to delete">Delete</ConfirmButton>
          </div>
        )}
        {list.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th className="check"><CheckAll all={sel.all} some={sel.some} onChange={sel.toggleAll} /></th><th>Product</th><th>Status</th><th>Inventory</th><th>Category</th><th>Product type</th><th>Vendor</th></tr></thead>
            <tbody>{list.map(p => {
              const st = stockOf(p)
              return (
                <tr key={p.id} className={'click' + (sel.has(p.id) ? ' selected' : '')} onClick={() => nav(`/products/${p.id}`)}>
                  <td className="check" onClick={e => e.stopPropagation()}><input type="checkbox" checked={sel.has(p.id)} onChange={() => sel.toggle(p.id)} aria-label={`Select ${p.title}`} /></td>
                  <td><div className="cell"><Thumb title={p.title} hue={p.hue} image={p.images[0]} /><b>{p.title}</b></div></td>
                  <td>{p.status === 'active' ? <Badge tone="good" plain>Active</Badge> : p.status === 'draft' ? <Badge tone="info" plain>Draft</Badge> : <Badge plain>Archived</Badge>}</td>
                  <td style={{ color: st === 0 ? 'var(--bad)' : st <= data.store.lowStockAt ? 'var(--warn)' : undefined }}>{st} in stock{p.variants.length > 1 && ` for ${p.variants.length} variants`}</td>
                  <td className="muted">{p.category || '—'}</td><td className="muted">{p.productType || '—'}</td><td className="muted">{p.vendor || '—'}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
        ) : <Empty title="No products found" icon={<Tag />}>{data.products.length ? 'Try another filter.' : 'Add your first product to get started.'}</Empty>}
      </section>
      {importing && <ImportProducts onClose={() => setImporting(false)} />}
      {colModal && (
        <Modal title="Add to collection" onClose={() => setColModal(false)} footer={<><button className="btn" onClick={() => setColModal(false)}>Cancel</button><button className="btn primary" disabled={!colPick} onClick={addToCollection}>Add</button></>}>
          <select value={colPick} onChange={e => setColPick(e.target.value)} aria-label="Collection"><option value="">Choose a collection</option>{data.collections.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        </Modal>
      )}
    </>
  )
}

function ImportProducts({ onClose }: { onClose: () => void }) {
  const { data, update } = useData()
  const toast = useToast()
  const [rows, setRows] = useState<Record<string, string>[] | null>(null)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')

  const onFile = async (f?: File) => {
    if (!f) return
    setErr(''); setName(f.name)
    try {
      const r = parseCSV(await readFileText(f))
      if (!r.length || !('Title' in r[0] || 'Handle' in r[0])) { setErr('This file needs a “Title” or “Handle” column. Download the template to see the format.'); setRows(null); return }
      setRows(r)
    } catch { setErr('Couldn’t read that file. Save it as CSV and try again.') }
  }
  const template = () => {
    downloadFile('product-import-template.csv', toCSV([
      { Handle: 'classic-tee', Title: 'Classic Tee', Description: 'Soft cotton tee', Status: 'active', Vendor: data.store.name, 'Product type': 'T-shirts', Category: 'Tops', Tags: 'cotton, basics', Collections: 'New in', 'Option names': 'Size', Variant: 'S', SKU: 'TEE-S', Price: 150, 'Compare-at price': '', 'Cost per item': 60, Stock: 10 },
      { Handle: 'classic-tee', Title: '', Description: '', Status: 'active', Vendor: '', 'Product type': '', Category: '', Tags: '', Collections: '', 'Option names': 'Size', Variant: 'M', SKU: 'TEE-M', Price: 150, 'Compare-at price': '', 'Cost per item': 60, Stock: 12 },
    ]))
  }
  const run = () => {
    if (!rows) return
    let res = { created: 0, updated: 0 }
    const handles = new Set(rows.map(r => r.Handle || r.Title))
    update(d => { res = rowsToProducts(d, rows) })
    toast(`Imported ${handles.size} products`)
    void res
    onClose()
  }
  return (
    <Modal title="Import products" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!rows} onClick={run}>Import {rows ? `${new Set(rows.map(r => r.Handle || r.Title)).size} products` : ''}</button></>}>
      <p className="muted">Upload a CSV file (from Excel, Google Sheets or a Shopify export). Rows with the same Handle become variants of one product. Existing products with a matching Handle are updated.</p>
      <input type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0])} aria-label="CSV file" />
      {name && rows && <p className="small">{name}: {rows.length} rows found.</p>}
      {err && <p className="error">{err}</p>}
      <button className="btn sm ghost" style={{ justifySelf: 'start' }} onClick={template}><Download />Download a template</button>
    </Modal>
  )
}
