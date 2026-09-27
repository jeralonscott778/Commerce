import { useState } from 'react'
import { Plus, Eye, EyeOff, FileText } from 'lucide-react'
import { useData, useToast } from '../data/store'
import type { Page, Store } from '../data/types'
import { PageHead, Field, Switch, Modal, ConfirmButton, Badge, Thumb, Empty, Menu } from '../components/ui'
import { money0, uid, slug } from '../lib/util'

function Preview({ sf, store }: { sf: Store['storefront']; store: Store }) {
  const { data } = useData()
  const items = data.products.filter(p => p.status === 'active' && (!sf.featuredCollectionId || p.collectionIds.includes(sf.featuredCollectionId))).slice(0, 3)
  const col = data.collections.find(c => c.id === sf.featuredCollectionId)
  return (
    <div className="site-preview">
      <div className="chrome"><i /><i /><i /><span>{store.domain}</span></div>
      {!sf.public ? (
        <div className="locked"><b style={{ fontSize: 18 }}>{store.name}</b><span style={{ opacity: .7, fontSize: 13 }}>Opening soon. Enter the password to preview.</span></div>
      ) : <>
        {sf.announcementOn && <div className="ann">{sf.announcement}</div>}
        <nav><b>{store.name}</b><span>Shop</span><span>{col?.title ?? 'All'}</span><span>Cart (0)</span></nav>
        <div className="hero"><h3>{sf.heroTitle}</h3><p>{sf.heroText}</p><span>{sf.heroButton}</span></div>
        <div style={{ padding: '14px 16px 0', fontWeight: 600, fontSize: 13 }}>{col?.title ?? 'Products'}</div>
        <div className="items">{items.map(p => <div key={p.id} style={{ display: 'grid', gap: 4 }}><Thumb title={p.title} hue={p.hue} image={p.images[0]} /><span>{p.title}</span><b>{money0(p.variants[0].price)}</b></div>)}{!items.length && <span style={{ gridColumn: '1/-1', color: '#777' }}>No active products in this collection.</span>}</div>
        <div style={{ borderTop: '1px solid #eee', padding: '10px 16px', fontSize: 11, color: '#666', display: 'flex', gap: 14, flexWrap: 'wrap' }}><span>WhatsApp {sf.whatsapp}</span><span>{sf.instagram}</span></div>
      </>}
    </div>
  )
}

export function OnlineStore() {
  const { data, update } = useData()
  const toast = useToast()
  const [sf, setSf] = useState(data.store.storefront)
  const dirty = JSON.stringify(sf) !== JSON.stringify(data.store.storefront)
  const set = (p: Partial<Store['storefront']>) => setSf(x => ({ ...x, ...p }))
  const publish = () => { update(d => { d.store.storefront = sf }); toast('Published. Your website is updated.') }

  return (
    <>
      <PageHead title="Online store" subtitle="Edit the words and highlights on your homepage. Check the preview, then publish."
        actions={<>
          <Menu trigger={t => <button className="btn soft" onClick={t}>{data.store.storefront.public ? <Eye /> : <EyeOff />}{data.store.storefront.public ? 'Public' : 'Password protected'}</button>}>
            {close => <>
              <button onClick={() => { update(d => { d.store.storefront.public = true }); setSf(x => ({ ...x, public: true })); toast('Your website is open to everyone'); close() }}><Eye />Public: anyone can shop</button>
              <button onClick={() => { update(d => { d.store.storefront.public = false }); setSf(x => ({ ...x, public: false })); toast('Your website now shows a “Opening soon” page'); close() }}><EyeOff />Password protected (opening soon)</button>
            </>}
          </Menu>
          <a className="btn soft" href={`https://${data.store.domain}`} target="_blank" rel="noreferrer">View store</a>
          <button className="btn primary" disabled={!dirty} onClick={publish}>Publish changes</button>
        </>} />
      <div className="split" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Announcement bar</h2><Switch label="Show announcement bar" checked={sf.announcementOn} onChange={v => set({ announcementOn: v })} /></div>
            <div className="card-body"><Field label="Message at the top of every page" htmlFor="ann"><input id="ann" type="text" maxLength={90} value={sf.announcement} onChange={e => set({ announcement: e.target.value })} /></Field></div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Homepage banner</h2></div>
            <div className="card-body">
              <Field label="Headline" htmlFor="ht"><input id="ht" type="text" value={sf.heroTitle} onChange={e => set({ heroTitle: e.target.value })} /></Field>
              <Field label="Supporting text" htmlFor="hx"><textarea id="hx" rows={2} value={sf.heroText} onChange={e => set({ heroText: e.target.value })} /></Field>
              <div className="grid2">
                <Field label="Button label" htmlFor="hb"><input id="hb" type="text" value={sf.heroButton} onChange={e => set({ heroButton: e.target.value })} /></Field>
                <Field label="Featured collection" htmlFor="fc"><select id="fc" value={sf.featuredCollectionId ?? ''} onChange={e => set({ featuredCollectionId: e.target.value || null })}><option value="">All products</option>{data.collections.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></Field>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>Contact & social</h2></div>
            <div className="card-body grid2">
              <Field label="WhatsApp number" htmlFor="wa"><input id="wa" type="tel" value={sf.whatsapp} onChange={e => set({ whatsapp: e.target.value })} /></Field>
              <Field label="Instagram" htmlFor="ig"><input id="ig" type="text" value={sf.instagram} onChange={e => set({ instagram: e.target.value })} /></Field>
            </div>
          </section>
        </div>
        <div style={{ position: 'sticky', top: 84, display: 'grid', gap: 8 }}>
          <span className="lbl">Preview {dirty && <Badge tone="warn">Unpublished changes</Badge>}</span>
          <Preview sf={sf} store={data.store} />
        </div>
      </div>
    </>
  )
}

export function Pages() {
  const { data, update } = useData()
  const toast = useToast()
  const [edit, setEdit] = useState<Page | null>(null)
  const save = () => {
    if (!edit) return
    if (!edit.title.trim()) return toast('Give the page a title')
    const p = { ...edit, id: edit.id || uid('pg') }
    update(d => { const i = d.pages.findIndex(x => x.id === p.id); if (i >= 0) d.pages[i] = p; else d.pages.push(p) })
    toast(`“${p.title}” saved`); setEdit(null)
  }
  return (
    <>
      <PageHead back={{ to: '/online-store', label: 'Online store' }} title="Pages" subtitle="About us, delivery and returns, privacy policy and other information pages."
        actions={<button className="btn primary" onClick={() => setEdit({ id: '', title: '', body: '', visible: true })}><Plus />Add page</button>} />
      <section className="card">
        {data.pages.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Title</th><th>Web address</th><th>Visibility</th></tr></thead>
            <tbody>{data.pages.map(p => <tr key={p.id} className="click" onClick={() => setEdit(structuredClone(p))}><td className="strong">{p.title}</td><td className="mono muted">/pages/{slug(p.title)}</td><td>{p.visible ? <Badge tone="good">Visible</Badge> : <Badge>Hidden</Badge>}</td></tr>)}</tbody>
          </table></div>
        ) : <Empty title="No pages yet" icon={<FileText />} />}
      </section>
      {edit && (
        <Modal wide title={edit.id ? 'Edit page' : 'Add page'} onClose={() => setEdit(null)}
          footer={<>{edit.id && <ConfirmButton onConfirm={() => { update(d => { d.pages = d.pages.filter(x => x.id !== edit.id) }); toast('Page deleted'); setEdit(null) }} confirmText="Click again to delete">Delete</ConfirmButton>}<span className="grow" /><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save page</button></>}>
          <Field label="Title" htmlFor="pt"><input id="pt" type="text" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="Content" htmlFor="pb"><textarea id="pb" rows={12} value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} /></Field>
          <label className="check-row"><input type="checkbox" checked={edit.visible} onChange={e => setEdit({ ...edit, visible: e.target.checked })} />Visible on website</label>
        </Modal>
      )}
    </>
  )
}

export function Preferences() {
  const { data, update } = useData()
  const toast = useToast()
  const [sf, setSf] = useState(data.store.storefront)
  const set = (p: Partial<Store['storefront']>) => setSf(x => ({ ...x, ...p }))
  return (
    <>
      <PageHead back={{ to: '/online-store', label: 'Online store' }} title="Preferences" subtitle="How your website appears on Google and who can see it."
        actions={<button className="btn primary" onClick={() => { if (!sf.public && !sf.password.trim()) return toast('Set a password or make the store public'); update(d => { d.store.storefront = sf }); toast('Preferences saved') }}>Save</button>} />
      <div className="two-col">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Google and social sharing</h2></div>
            <div className="card-body">
              <div style={{ display: 'grid', gap: 2, background: 'var(--surface-2)', borderRadius: 10, padding: 14 }}>
                <span className="small" style={{ color: 'var(--good)' }}>https://{data.store.domain}</span>
                <span style={{ color: 'var(--info)', fontSize: 17 }}>{sf.seoTitle || data.store.name}</span>
                <span className="small muted">{sf.seoDescription || 'Add a description to show here.'}</span>
              </div>
              <Field label="Homepage title" hint={`${sf.seoTitle.length} of 70 characters`} htmlFor="st"><input id="st" type="text" maxLength={70} value={sf.seoTitle} onChange={e => set({ seoTitle: e.target.value })} /></Field>
              <Field label="Homepage description" hint={`${sf.seoDescription.length} of 160 characters`} htmlFor="sd"><textarea id="sd" rows={3} maxLength={160} value={sf.seoDescription} onChange={e => set({ seoDescription: e.target.value })} /></Field>
            </div>
          </section>
        </div>
        <aside>
          <section className="card">
            <div className="card-head"><h2>Password protection</h2><Switch label="Password protect the store" checked={!sf.public} onChange={v => set({ public: !v })} /></div>
            <div className="card-body">
              <span className="hint">Turn on while you’re still setting up. Visitors see an “Opening soon” page.</span>
              {!sf.public && <Field label="Password" htmlFor="pw"><input id="pw" type="text" value={sf.password} onChange={e => set({ password: e.target.value })} placeholder="Share this with people you want to preview" /></Field>}
            </div>
          </section>
        </aside>
      </div>
    </>
  )
}
