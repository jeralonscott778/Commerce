import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import { blankProduct, generateVariants } from '../../data/logic'
import type { Product, Variant } from '../../data/types'
import { PageHead, Field, MoneyInput, TagInput, ConfirmButton, Thumb, Empty, Badge } from '../../components/ui'
import { money, slug, uid, initials } from '../../lib/util'

export default function ProductEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const { data, update, api } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const existing = data.products.find(p => p.id === id)
  const [p, setP] = useState<Product>(() => existing ? structuredClone(existing) : blankProduct(data.store.id))
  const [dirty, setDirty] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (!isNew && !existing) return <><PageHead title="Product not found" back={{ to: '/products', label: 'Products' }} /><Empty title="This product doesn't exist or was deleted." /></>

  const set = (patch: Partial<Product>) => { setP(x => ({ ...x, ...patch })); setDirty(true) }
  const single = p.options.length === 0
  const v0 = p.variants[0]
  const setV = (i: number, patch: Partial<Variant>) => { setP(x => ({ ...x, variants: x.variants.map((v, j) => j === i ? { ...v, ...patch } : v) })); setDirty(true) }
  const skuPrefix = initials(data.store.name) + '-' + (slug(p.title).slice(0, 6).toUpperCase() || 'ITEM')

  const setOptions = (options: Product['options']) => {
    setP(x => ({ ...x, options, variants: generateVariants(options, x.variants, x.variants[0]?.price ?? 0, skuPrefix) }))
    setDirty(true)
  }

  const addImages = async (files: FileList | null) => {
    if (!files) return
    try {
      toast('Uploading…')
      const urls = await Promise.all([...files].slice(0, 8).map(f => api.uploadImage(f)))
      set({ images: [...p.images, ...urls] })
    } catch (e) { toast(`Upload failed: ${(e as Error).message}`) }
  }

  const save = () => {
    const e: Record<string, string> = {}
    if (!p.title.trim()) e.title = 'Give the product a name'
    if (p.variants.some(v => !(v.price >= 0))) e.price = 'Every variant needs a price'
    const handle = slug(p.handle || p.title)
    if (data.products.some(x => x.handle === handle && x.id !== p.id)) e.handle = 'Another product already uses this web address'
    setErrors(e)
    if (Object.keys(e).length) { toast(Object.values(e)[0]); return }
    const newId = p.id || uid('p')
    const final: Product = { ...p, modifiers: p.modifiers.filter(g => g.name.trim()).map(g => ({ ...g, choices: g.choices.filter(c => c.name.trim()) })).filter(g => g.choices.length), id: newId, handle, seoTitle: p.seoTitle || `${p.title} | ${data.store.name}`, seoDescription: p.seoDescription || p.description.slice(0, 155), updatedAt: new Date().toISOString(), variants: p.variants.map((v, i) => ({ ...v, sku: v.sku || `${skuPrefix}-${i + 1}` })) }
    update(d => {
      const i = d.products.findIndex(x => x.id === newId)
      if (i >= 0) d.products[i] = final; else d.products.unshift(final)
    })
    setDirty(false)
    toast(isNew ? 'Product created' : final.status === 'active' ? 'Saved. Your website is up to date.' : 'Saved')
    setP(final)
    if (isNew) nav(`/products/${newId}`, { replace: true })
  }
  const del = () => { update(d => { d.products = d.products.filter(x => x.id !== p.id) }); toast('Product deleted'); nav('/products') }

  const margin = v0 && v0.cost != null && v0.price > 0 ? ((v0.price - v0.cost) / v0.price) * 100 : null

  return (
    <>
      <PageHead back={{ to: '/products', label: 'Products' }} title={isNew ? 'Add product' : p.title || 'Untitled product'}
        subtitle={dirty ? <span style={{ color: 'var(--warn)' }}>Unsaved changes</span> : !isNew ? `Last saved ${new Date(p.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : undefined}
        actions={<>
          {!isNew && <ConfirmButton onConfirm={del} confirmText="Click again to delete">Delete</ConfirmButton>}
          <button className="btn primary" onClick={save}>Save</button>
        </>} />
      <div className="two-col">
        <div className="stack">
          <section className="card"><div className="card-body">
            <Field label="Title" htmlFor="t" error={errors.title}><input id="t" type="text" value={p.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Classic cotton tee" /></Field>
            <Field label="Description" htmlFor="desc"><textarea id="desc" rows={5} value={p.description} onChange={e => set({ description: e.target.value })} placeholder="What it’s made of, how it fits, how to use it" /></Field>
          </div></section>

          <section className="card">
            <div className="card-head"><h2>Media</h2><span className="small muted">{p.images.length} image{p.images.length === 1 ? '' : 's'}</span></div>
            <div className="card-body">
              <div className="row wrap" style={{ gap: 10 }}>
                {p.images.map((src, i) => (
                  <div key={i} style={{ position: 'relative', width: 96 }}>
                    <div className="thumb xl" style={{ ['--h' as string]: p.hue }}><img src={src} alt="" /></div>
                    {i === 0 && <span className="badge plain" style={{ position: 'absolute', left: 6, bottom: 6, height: 20 }}>Main</span>}
                    <button className="btn sm icon" style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26 }} onClick={() => set({ images: p.images.filter((_, j) => j !== i) })} aria-label="Remove image"><X /></button>
                  </div>
                ))}
                <label className="thumb xl" style={{ width: 96, background: 'var(--surface-2)', color: 'var(--muted)', cursor: 'pointer', border: '1px dashed var(--faint)', fontWeight: 500, fontSize: 12, display: 'grid', gap: 4, alignContent: 'center' }}>
                  <ImagePlus size={20} style={{ margin: '0 auto' }} />Add
                  <input type="file" accept="image/*" multiple hidden onChange={e => addImages(e.target.files)} />
                </label>
              </div>
              <span className="hint">The first image is the main photo on your website. Square photos look best.</span>
            </div>
          </section>

          {single && v0 && (
            <>
              <section className="card">
                <div className="card-head"><h2>Pricing</h2></div>
                <div className="card-body">
                  <div className="grid2">
                    <Field label="Price" htmlFor="pr" error={errors.price}><MoneyInput id="pr" value={v0.price} onChange={v => setV(0, { price: v ?? 0 })} /></Field>
                    <Field label="Compare-at price" hint="Shows a crossed-out price when on sale." htmlFor="cp"><MoneyInput id="cp" value={v0.compareAt} onChange={v => setV(0, { compareAt: v })} placeholder="Optional" /></Field>
                  </div>
                  <div className="grid3">
                    <Field label="Cost per item" hint="Customers won’t see this." htmlFor="cost"><MoneyInput id="cost" value={v0.cost} onChange={v => setV(0, { cost: v })} placeholder="Optional" /></Field>
                    <Field label="Profit"><input type="text" readOnly value={v0.cost != null ? money(v0.price - v0.cost) : '—'} aria-label="Profit" /></Field>
                    <Field label="Margin"><input type="text" readOnly value={margin != null ? `${margin.toFixed(1)}%` : '—'} aria-label="Margin" /></Field>
                  </div>
                </div>
              </section>
              <section className="card">
                <div className="card-head"><h2>Inventory</h2></div>
                <div className="card-body">
                  <label className="check-row"><input type="checkbox" checked={v0.trackStock} onChange={e => setV(0, { trackStock: e.target.checked })} />Track stock for this product</label>
                  <div className="grid2">
                    <Field label="SKU (stock code)" htmlFor="sku"><input id="sku" type="text" className="mono" value={v0.sku} onChange={e => setV(0, { sku: e.target.value })} placeholder={`${skuPrefix}-1`} /></Field>
                    {v0.trackStock && <Field label="Quantity in stock" htmlFor="qty"><input id="qty" type="number" min={0} value={v0.stock} onChange={e => setV(0, { stock: Math.max(0, Number(e.target.value) || 0) })} /></Field>}
                  </div>
                </div>
              </section>
            </>
          )}

          <section className="card">
            <div className="card-head"><h2>Variants</h2>{p.options.length < 3 && <button className="btn sm" onClick={() => setOptions([...p.options, { name: p.options.length === 0 ? 'Size' : p.options.length === 1 ? 'Colour' : 'Material', values: [] }])}><Plus />Add option</button>}</div>
            <div className="card-body">
              {single && <p className="muted small">Add options like size or colour if this product comes in different versions.</p>}
              {p.options.map((o, oi) => (
                <div key={oi} className="grid2" style={{ alignItems: 'start', gridTemplateColumns: '180px minmax(0,1fr) auto' }}>
                  <Field label="Option name"><input type="text" value={o.name} onChange={e => setOptions(p.options.map((x, j) => j === oi ? { ...x, name: e.target.value } : x))} aria-label="Option name" /></Field>
                  <Field label="Values"><TagInput tags={o.values} onChange={vals => setOptions(p.options.map((x, j) => j === oi ? { ...x, values: vals } : x))} placeholder="Type a value (e.g. M) and press Enter" /></Field>
                  <button className="btn ghost icon" style={{ marginTop: 26 }} onClick={() => setOptions(p.options.filter((_, j) => j !== oi))} aria-label="Remove option"><Trash2 /></button>
                </div>
              ))}
            </div>
            {!single && (
              <div className="table-wrap" style={{ borderTop: '1px solid var(--line-2)' }}>
                <table>
                  <thead><tr><th>Variant</th><th>Price</th><th>Compare-at</th><th>Stock</th><th>SKU</th></tr></thead>
                  <tbody>{p.variants.map((v, i) => (
                    <tr key={v.id}>
                      <td className="strong">{v.title}</td>
                      <td><div style={{ width: 130 }}><MoneyInput value={v.price} onChange={x => setV(i, { price: x ?? 0 })} /></div></td>
                      <td><div style={{ width: 130 }}><MoneyInput value={v.compareAt} onChange={x => setV(i, { compareAt: x })} /></div></td>
                      <td><input type="number" min={0} value={v.stock} style={{ width: 80 }} onChange={e => setV(i, { stock: Math.max(0, Number(e.target.value) || 0) })} aria-label={`Stock for ${v.title}`} /></td>
                      <td><input type="text" className="mono" value={v.sku} style={{ width: 140 }} onChange={e => setV(i, { sku: e.target.value })} placeholder={`${skuPrefix}-${i + 1}`} aria-label={`SKU for ${v.title}`} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                <div className="foot-note">{p.variants.length} variants · {p.variants.reduce((s, v) => s + v.stock, 0)} in stock in total</div>
              </div>
            )}
          </section>

          {(data.store.businessType === 'restaurant' || p.modifiers.length > 0) && (
            <section className="card">
              <div className="card-head"><h2>Add-ons and choices</h2><button className="btn sm" onClick={() => set({ modifiers: [...p.modifiers, { name: p.modifiers.length ? 'Extras' : 'Size', required: !p.modifiers.length, max: 1, choices: [{ name: '', price: 0 }] }] })}><Plus />Add group</button></div>
              <div className="card-body">
                {!p.modifiers.length && <p className="muted small">For choices like size, milk, spice level or extra protein. Customers pick them on the website, WhatsApp and the till.</p>}
                {p.modifiers.map((g, gi) => {
                  const setG = (patch: Partial<typeof g>) => set({ modifiers: p.modifiers.map((x, j) => j === gi ? { ...x, ...patch } : x) })
                  return (
                    <div key={gi} className="stack" style={{ gap: 10, padding: 14, border: '1px solid var(--line)', borderRadius: 12 }}>
                      <div className="row wrap">
                        <input type="text" value={g.name} onChange={e => setG({ name: e.target.value })} placeholder="Group name, e.g. Milk" aria-label="Group name" style={{ flex: 1, minWidth: 160 }} />
                        <label className="check-row"><input type="checkbox" checked={g.required} onChange={e => setG({ required: e.target.checked })} />Required</label>
                        <label className="row small">Up to <input type="number" min={1} value={g.max} onChange={e => setG({ max: Math.max(1, Number(e.target.value) || 1) })} style={{ width: 64, height: 34 }} aria-label="Most choices" /></label>
                        <button className="btn ghost sm icon" onClick={() => set({ modifiers: p.modifiers.filter((_, j) => j !== gi) })} aria-label="Remove group"><Trash2 /></button>
                      </div>
                      {g.choices.map((c, ci) => (
                        <div key={ci} className="row">
                          <input type="text" value={c.name} onChange={e => setG({ choices: g.choices.map((x, k) => k === ci ? { ...x, name: e.target.value } : x) })} placeholder="Choice, e.g. Oat milk" aria-label="Choice name" style={{ flex: 1 }} />
                          <div style={{ width: 140 }}><MoneyInput value={c.price || null} onChange={v => setG({ choices: g.choices.map((x, k) => k === ci ? { ...x, price: v ?? 0 } : x) })} placeholder="+0" /></div>
                          <button className="btn ghost sm icon" onClick={() => setG({ choices: g.choices.filter((_, k) => k !== ci) })} aria-label="Remove choice"><X /></button>
                        </div>
                      ))}
                      <button className="btn sm ghost" style={{ justifySelf: 'start' }} onClick={() => setG({ choices: [...g.choices, { name: '', price: 0 }] })}><Plus />Add choice</button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-head"><h2>Search engine listing</h2></div>
            <div className="card-body">
              <div style={{ display: 'grid', gap: 2 }}>
                <span className="small" style={{ color: 'var(--good)' }}>{data.store.domain}/products/{slug(p.handle || p.title) || 'product-name'}</span>
                <span style={{ color: 'var(--info)', fontSize: 17 }}>{p.seoTitle || (p.title ? `${p.title} | ${data.store.name}` : 'Product title')}</span>
                <span className="small muted">{(p.seoDescription || p.description || 'Your product description appears here.').slice(0, 160)}</span>
              </div>
              <Field label="Page title" htmlFor="st"><input id="st" type="text" value={p.seoTitle} onChange={e => set({ seoTitle: e.target.value })} placeholder={p.title ? `${p.title} | ${data.store.name}` : ''} /></Field>
              <Field label="Meta description" htmlFor="sd"><textarea id="sd" rows={2} value={p.seoDescription} onChange={e => set({ seoDescription: e.target.value })} /></Field>
              <Field label="Web address" htmlFor="h" error={errors.handle}><div className="input-group"><span>/products/</span><input id="h" type="text" value={p.handle} onChange={e => set({ handle: e.target.value })} placeholder={slug(p.title)} /></div></Field>
            </div>
          </section>
        </div>

        <aside>
          <section className="card">
            <div className="card-head"><h2>Status</h2></div>
            <div className="card-body">
              <select value={p.status} onChange={e => set({ status: e.target.value as Product['status'] })} aria-label="Status">
                <option value="active">Active</option><option value="draft">Draft</option><option value="archived">Archived</option>
              </select>
              <span className="hint">{p.status === 'active' ? 'Visible on your website.' : p.status === 'draft' ? 'Hidden from customers until you set it to Active.' : 'Hidden and kept for your records.'}</span>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Preview</h2>{p.status === 'active' ? <Badge tone="good" plain>On website</Badge> : <Badge plain>Hidden</Badge>}</div>
            <div className="card-body" style={{ gridTemplateColumns: '88px 1fr', alignItems: 'center' }}>
              <Thumb title={p.title} hue={p.hue} image={p.images[0]} size="xl" />
              <div><b>{p.title || 'Product title'}</b><div className="small">{v0 && v0.compareAt ? <><s className="faint">{money(v0.compareAt)}</s> </> : null}{money(Math.min(...p.variants.map(v => v.price)))}</div></div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Organisation</h2></div>
            <div className="card-body">
              <Field label="Category" htmlFor="cat"><input id="cat" type="text" value={p.category} onChange={e => set({ category: e.target.value })} list="cats" placeholder="e.g. T-shirts" /></Field>
              <datalist id="cats">{[...new Set(data.products.map(x => x.category).filter(Boolean))].map(c => <option key={c} value={c} />)}</datalist>
              <Field label="Product type" htmlFor="pt"><input id="pt" type="text" value={p.productType} onChange={e => set({ productType: e.target.value })} /></Field>
              <Field label="Vendor / brand" htmlFor="vd"><input id="vd" type="text" value={p.vendor} onChange={e => set({ vendor: e.target.value })} placeholder={data.store.name} /></Field>
              <Field label="Collections">
                <div className="stack" style={{ gap: 6 }}>
                  {data.collections.map(c => (
                    <label key={c.id} className="check-row"><input type="checkbox" checked={p.collectionIds.includes(c.id)} onChange={e => set({ collectionIds: e.target.checked ? [...p.collectionIds, c.id] : p.collectionIds.filter(x => x !== c.id) })} />{c.title}</label>
                  ))}
                </div>
              </Field>
              <Field label="Tags"><TagInput tags={p.tags} onChange={t => set({ tags: t })} /></Field>
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
