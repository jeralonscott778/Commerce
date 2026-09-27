import { useState } from 'react'
import { useData } from '../data/store'
import type { LineItem } from '../data/types'
import { Modal, SearchBox, Thumb } from './ui'
import { money } from '../lib/util'

/** Choose products/variants and quantities to add to an order. */
export default function ProductPicker({ onAdd, onClose }: { onAdd: (items: LineItem[]) => void; onClose: () => void }) {
  const { data } = useData()
  const [q, setQ] = useState('')
  const [qty, setQty] = useState<Record<string, number>>({})
  const list = data.products.filter(p => p.status !== 'archived' && (!q || `${p.title} ${p.variants.map(v => v.sku).join(' ')}`.toLowerCase().includes(q.toLowerCase())))
  const chosen = Object.entries(qty).filter(([, n]) => n > 0)

  const add = () => {
    const items: LineItem[] = []
    for (const [vid, n] of chosen) {
      const p = data.products.find(x => x.variants.some(v => v.id === vid))!
      const v = p.variants.find(x => x.id === vid)!
      items.push({ productId: p.id, variantId: v.id, title: p.title, variantTitle: v.title, price: v.price, qty: n, hue: p.hue, image: p.images[0] })
    }
    onAdd(items); onClose()
  }

  return (
    <Modal wide title="Add products" onClose={onClose}
      footer={<><span className="muted small grow">{chosen.length ? `${chosen.reduce((s, [, n]) => s + n, 0)} items chosen` : 'Set a quantity to choose items'}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!chosen.length} onClick={add}>Add to order</button></>}>
      <SearchBox value={q} onChange={setQ} placeholder="Search products or SKU" />
      <div className="list" style={{ margin: '0 -20px' }}>
        {list.map(p => (
          <div key={p.id}>
            <div className="list-item" style={{ background: 'var(--surface-2)' }}>
              <Thumb title={p.title} hue={p.hue} image={p.images[0]} size="sm" />
              <b className="grow">{p.title}</b>
              {p.status === 'draft' && <span className="badge plain">Draft</span>}
            </div>
            {p.variants.map(v => (
              <div key={v.id} className="list-item" style={{ paddingLeft: 68 }}>
                <span className="grow">{v.title}<span className="small muted"> · {v.trackStock ? `${v.stock} in stock` : 'Not tracked'}</span></span>
                <span className="num">{money(v.price)}</span>
                <input type="number" min={0} value={qty[v.id] ?? 0} style={{ width: 72, height: 34 }} aria-label={`Quantity of ${p.title} ${v.title}`}
                  onChange={e => setQty(s => ({ ...s, [v.id]: Math.max(0, Number(e.target.value) || 0) }))} />
              </div>
            ))}
          </div>
        ))}
        {!list.length && <div className="empty">No products match.</div>}
      </div>
    </Modal>
  )
}
