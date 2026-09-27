import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData, useToast } from '../data/store'
import type { Store } from '../data/types'
import { PageHead, Field } from '../components/ui'

/** Set up another client's store. The person signed in becomes its owner and can invite the client. */
export default function NewStore() {
  const { api, live } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [owner, setOwner] = useState('')
  const [type, setType] = useState<Store['businessType']>('retail')
  const [sample, setSample] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!live) return <><PageHead title="Add a store" /><div className="card"><div className="card-body muted">Connect the database to add real stores. In demo mode, switch between the sample stores in the sidebar.</div></div></>
  return (
    <>
      <PageHead back={{ to: '/', label: 'Back' }} title="Add a store" subtitle="Each client gets their own store. Their data is kept separate from every other store." />
      <form className="card" style={{ maxWidth: 560 }} onSubmit={async e => {
        e.preventDefault(); setBusy(true)
        try { await api.createStore(name.trim(), owner.trim(), sample, type); toast(`${name} is ready`); nav('/') } catch (x) { toast((x as Error).message) }
        setBusy(false)
      }}>
        <div className="card-body">
          <Field label="Store name" htmlFor="n"><input id="n" type="text" required value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Your name" htmlFor="o"><input id="o" type="text" value={owner} onChange={e => setOwner(e.target.value)} /></Field>
          <Field label="Type of business" htmlFor="t"><select id="t" value={type} onChange={e => setType(e.target.value as Store['businessType'])}><option value="retail">Shop</option><option value="restaurant">Restaurant or café</option><option value="services">Services (bookings)</option></select></Field>
          <label className="check-row"><input type="checkbox" checked={sample} onChange={e => setSample(e.target.checked)} />Fill it with sample products and orders</label>
          <p className="small muted">Afterwards, invite the client from Settings → Team so they can sign in and run it themselves.</p>
          <div><button className="btn primary" disabled={busy || !name.trim()} type="submit">{busy ? 'Creating…' : 'Create store'}</button></div>
        </div>
      </form>
    </>
  )
}
