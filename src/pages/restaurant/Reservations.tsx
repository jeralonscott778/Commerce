// Table bookings, the floor (tables) and booking rules.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Users, Copy } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import type { DiningTable, Reservation, StoreSettings } from '../../data/types'
import { PageHead, Tabs, Badge, Modal, Field, Empty, Switch, MoneyInput, ConfirmButton, type Tone } from '../../components/ui'
import { addDays, fTime, isoDay, money0, uid, cx } from '../../lib/util'

const STATUS: Record<Reservation['status'], { label: string; tone: Tone }> = {
  booked: { label: 'Booked', tone: 'info' }, seated: { label: 'Seated', tone: 'good' }, completed: { label: 'Finished', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' }, no_show: { label: 'No-show', tone: 'bad' },
}
const DEFAULTS: NonNullable<StoreSettings['reservations']> = { enabled: false, opens: '12:00', closes: '22:00', slot_minutes: 30, duration_minutes: 90, max_covers: 40, max_party: 8, deposit_over_party: 6, deposit_amount: 100 }

export default function Reservations() {
  const [tab, setTab] = useState<'bookings' | 'tables' | 'rules'>('bookings')
  return (
    <>
      <PageHead title="Reservations" subtitle="Bookings from your website, WhatsApp and phone, plus your tables." />
      <section className="card"><Tabs value={tab} onChange={setTab} tabs={[{ key: 'bookings', label: 'Bookings' }, { key: 'tables', label: 'Tables' }, { key: 'rules', label: 'Booking rules' }]} />
        {tab === 'bookings' && <Bookings />}{tab === 'tables' && <Tables />}{tab === 'rules' && <Rules />}
      </section>
    </>
  )
}

function Bookings() {
  const { data, update } = useData()
  const toast = useToast()
  const [day, setDay] = useState(isoDay(new Date()))
  const [edit, setEdit] = useState<Reservation | null>(null)
  const list = data.reservations.filter(r => isoDay(r.startsAt) === day).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const covers = list.filter(r => r.status === 'booked' || r.status === 'seated').reduce((s, r) => s + r.partySize, 0)
  const setStatus = (r: Reservation, status: Reservation['status']) => {
    update(d => {
      const x = d.reservations.find(y => y.id === r.id); if (!x) return
      x.status = status
      const t = d.tables.find(y => y.id === x.tableId)
      if (t) t.status = status === 'seated' ? 'seated' : status === 'completed' || status === 'no_show' || status === 'cancelled' ? 'free' : t.status
    })
    toast(`${r.name}: ${STATUS[status].label.toLowerCase()}`)
  }
  const shift = (n: number) => setDay(isoDay(addDays(n, new Date(day + 'T12:00'))))
  const blank = (): Reservation => { const at = new Date(day + 'T19:00'); return { id: '', storeId: data.store.id, name: '', phone: '', email: '', partySize: 2, startsAt: at.toISOString(), durationMin: data.store.settings.reservations?.duration_minutes ?? 90, tableId: null, status: 'booked', depositAmount: 0, depositPaid: false, notes: '', source: 'phone', createdAt: new Date().toISOString() } }

  return (
    <>
      <div className="toolbar">
        <div className="row"><button className="btn icon" onClick={() => shift(-1)} aria-label="Previous day"><ChevronLeft /></button>
          <input type="date" value={day} onChange={e => setDay(e.target.value)} style={{ width: 'auto' }} aria-label="Day" />
          <button className="btn icon" onClick={() => shift(1)} aria-label="Next day"><ChevronRight /></button>
          {day !== isoDay(new Date()) && <button className="btn ghost sm" onClick={() => setDay(isoDay(new Date()))}>Today</button>}</div>
        <span className="grow" />
        <span className="small muted"><Users size={14} style={{ verticalAlign: '-2px' }} /> {covers} guests expected · {list.filter(r => r.status === 'booked').length} bookings to arrive</span>
        <button className="btn primary" onClick={() => setEdit(blank())}><Plus />Add booking</button>
      </div>
      {list.length ? (
        <div className="table-wrap"><table>
          <thead><tr><th>Time</th><th>Guest</th><th>People</th><th>Table</th><th>Notes</th><th>Status</th><th></th></tr></thead>
          <tbody>{list.map(r => (
            <tr key={r.id} className="click" onClick={() => setEdit(structuredClone(r))}>
              <td className="strong num">{fTime(r.startsAt)}</td>
              <td><b style={{ fontWeight: 500 }}>{r.name}</b><div className="xs muted">{r.phone} · via {r.source}</div></td>
              <td className="num">{r.partySize}</td>
              <td>{data.tables.find(t => t.id === r.tableId)?.name ?? <span className="faint">Not set</span>}</td>
              <td className="wrap small">{r.notes}{r.depositAmount > 0 && <div><Badge tone={r.depositPaid ? 'good' : 'warn'} plain>{r.depositPaid ? 'Deposit paid' : 'Deposit due'} {money0(r.depositAmount)}</Badge></div>}</td>
              <td><Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></td>
              <td className="r" onClick={e => e.stopPropagation()}>
                {r.status === 'booked' && <><button className="btn sm primary" onClick={() => setStatus(r, 'seated')}>Seat</button> <button className="btn sm ghost" onClick={() => setStatus(r, 'no_show')}>No-show</button></>}
                {r.status === 'seated' && <button className="btn sm" onClick={() => setStatus(r, 'completed')}>Finished</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <Empty title="No bookings on this day" />}
      {edit && <BookingModal r={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function BookingModal({ r, onClose }: { r: Reservation; onClose: () => void }) {
  const { data, update } = useData()
  const toast = useToast()
  const [x, setX] = useState(r)
  const set = (p: Partial<Reservation>) => setX(v => ({ ...v, ...p }))
  const date = isoDay(x.startsAt), time = fTime(x.startsAt)
  const setWhen = (d: string, t: string) => set({ startsAt: new Date(`${d}T${t}`).toISOString() })
  const free = data.tables.filter(t => t.seats >= x.partySize)
  const save = () => {
    if (!x.name.trim() || x.phone.replace(/\D/g, '').length < 9) return toast('Add the guest’s name and phone number')
    const final = { ...x, id: x.id || uid() }
    update(d => { const i = d.reservations.findIndex(y => y.id === final.id); if (i >= 0) d.reservations[i] = final; else d.reservations.push(final) })
    toast(x.id ? 'Booking updated' : `Booked ${final.name} for ${final.partySize}`); onClose()
  }
  const confirmText = `Hi ${x.name.split(' ')[0]}, your table for ${x.partySize} at ${data.store.name} is booked for ${new Date(x.startsAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Reply to this message if your plans change.`
  return (
    <Modal title={x.id ? 'Booking' : 'New booking'} onClose={onClose} footer={<>
      {x.id && <ConfirmButton onConfirm={() => { update(d => { const y = d.reservations.find(z => z.id === x.id); if (y) y.status = 'cancelled' }); toast('Booking cancelled'); onClose() }} confirmText="Cancel this booking?">Cancel booking</ConfirmButton>}
      <span className="grow" /><button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(confirmText); toast('Confirmation copied. Paste it into WhatsApp.') } catch { toast(confirmText) } }}><Copy />Copy confirmation</button>
      <button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid2">
        <Field label="Guest name" htmlFor="bn"><input id="bn" type="text" value={x.name} onChange={e => set({ name: e.target.value })} /></Field>
        <Field label="Phone / WhatsApp" htmlFor="bp"><input id="bp" type="tel" value={x.phone} onChange={e => set({ phone: e.target.value })} /></Field>
      </div>
      <div className="grid3">
        <Field label="Date" htmlFor="bd"><input id="bd" type="date" value={date} onChange={e => setWhen(e.target.value, time)} /></Field>
        <Field label="Time" htmlFor="bt"><input id="bt" type="time" value={time} step={900} onChange={e => setWhen(date, e.target.value)} style={{ height: 40, border: '1px solid var(--line)', borderRadius: 10, padding: '0 10px', background: 'var(--surface)' }} /></Field>
        <Field label="People" htmlFor="bs"><input id="bs" type="number" min={1} value={x.partySize} onChange={e => set({ partySize: Math.max(1, Number(e.target.value) || 1) })} /></Field>
      </div>
      <Field label="Table" htmlFor="btab"><select id="btab" value={x.tableId ?? ''} onChange={e => set({ tableId: e.target.value || null })}><option value="">Decide on arrival</option>{free.map(t => <option key={t.id} value={t.id}>{t.name} ({t.seats} seats, {t.area})</option>)}</select></Field>
      <div className="grid2">
        <Field label="Deposit" htmlFor="bdep"><MoneyInput id="bdep" value={x.depositAmount || null} onChange={v => set({ depositAmount: v ?? 0 })} placeholder="None" /></Field>
        <label className="check-row" style={{ alignSelf: 'end', paddingBottom: 10 }}><input type="checkbox" checked={x.depositPaid} onChange={e => set({ depositPaid: e.target.checked })} />Deposit paid</label>
      </div>
      <Field label="Notes" htmlFor="bno"><input id="bno" type="text" value={x.notes} onChange={e => set({ notes: e.target.value })} placeholder="Allergies, occasion, seating preference" /></Field>
      <Field label="Booked through" htmlFor="bsrc"><select id="bsrc" value={x.source} onChange={e => set({ source: e.target.value })}>{['phone', 'whatsapp', 'website', 'walk-in', 'instagram'].map(s => <option key={s}>{s}</option>)}</select></Field>
    </Modal>
  )
}

function Tables() {
  const { data, update } = useData()
  const toast = useToast()
  const [edit, setEdit] = useState<DiningTable | null>(null)
  const areas = useMemo(() => [...new Set(data.tables.map(t => t.area))], [data.tables])
  const open = (t: DiningTable) => data.orders.find(o => o.tableId === t.id && o.paymentStatus === 'pending' && o.fulfilmentStatus !== 'cancelled')
  const save = () => {
    if (!edit?.name.trim()) return toast('Give the table a name')
    const t = { ...edit, id: edit.id || uid() }
    update(d => { const i = d.tables.findIndex(x => x.id === t.id); if (i >= 0) d.tables[i] = t; else d.tables.push({ ...t, position: d.tables.length }) })
    setEdit(null)
  }
  return (
    <div className="card-body">
      <div className="row between"><span className="small muted">Tap a table to rename it or change seats. Colours show what’s happening now.</span><button className="btn primary sm" onClick={() => setEdit({ id: '', storeId: data.store.id, name: `T${data.tables.length + 1}`, area: areas[0] ?? 'Main', seats: 4, status: 'free', position: data.tables.length })}><Plus />Add table</button></div>
      {areas.map(a => (
        <div key={a} className="stack" style={{ gap: 8 }}>
          <span className="lbl">{a}</span>
          <div className="floor">{data.tables.filter(t => t.area === a).map(t => {
            const o = open(t)
            return (
              <button key={t.id} className={cx('table-tile', t.status)} onClick={() => setEdit(structuredClone(t))}>
                <b>{t.name}</b><span className="xs">{t.seats} seats</span>
                <span className="xs">{o ? `#${o.number} · ${money0(o.subtotal)}` : t.status === 'free' ? 'Free' : t.status}</span>
              </button>
            )
          })}</div>
        </div>
      ))}
      {!data.tables.length && <Empty title="No tables yet" />}
      {edit && (
        <Modal title={edit.id ? `Table ${edit.name}` : 'Add table'} onClose={() => setEdit(null)} footer={<>{edit.id && <ConfirmButton onConfirm={() => { update(d => { d.tables = d.tables.filter(x => x.id !== edit.id) }); setEdit(null) }} confirmText="Delete table?">Delete</ConfirmButton>}<span className="grow" /><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          <div className="grid3">
            <Field label="Name" htmlFor="tn"><input id="tn" type="text" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Area" htmlFor="ta"><input id="ta" type="text" list="areas" value={edit.area} onChange={e => setEdit({ ...edit, area: e.target.value })} /></Field>
            <Field label="Seats" htmlFor="ts"><input id="ts" type="number" min={1} value={edit.seats} onChange={e => setEdit({ ...edit, seats: Math.max(1, Number(e.target.value) || 1) })} /></Field>
          </div>
          <datalist id="areas">{areas.map(a => <option key={a} value={a} />)}</datalist>
          <Field label="Status" htmlFor="tst"><select id="tst" value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value as DiningTable['status'] })}><option value="free">Free</option><option value="seated">Guests seated</option><option value="ordered">Ordered</option><option value="bill">Asked for the bill</option><option value="reserved">Reserved</option></select></Field>
        </Modal>
      )}
    </div>
  )
}

function Rules() {
  const { data, update } = useData()
  const toast = useToast()
  const [r, setR] = useState({ ...DEFAULTS, ...(data.store.settings.reservations ?? {}) })
  const set = (p: Partial<typeof r>) => setR(x => ({ ...x, ...p }))
  const num = (k: keyof typeof r) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: Math.max(0, Number(e.target.value) || 0) } as Partial<typeof r>)
  return (
    <div className="card-body">
      <div className="row between"><div><b>Take bookings on the website</b><p className="small muted">Guests pick a time and it appears here straight away.</p></div><Switch label="Accept online bookings" checked={r.enabled} onChange={v => set({ enabled: v })} /></div>
      <div className="grid3">
        <Field label="First booking" htmlFor="ro"><input id="ro" type="time" value={r.opens} onChange={e => set({ opens: e.target.value })} style={{ height: 40, border: '1px solid var(--line)', borderRadius: 10, padding: '0 10px', background: 'var(--surface)' }} /></Field>
        <Field label="Kitchen closes" htmlFor="rc"><input id="rc" type="time" value={r.closes} onChange={e => set({ closes: e.target.value })} style={{ height: 40, border: '1px solid var(--line)', borderRadius: 10, padding: '0 10px', background: 'var(--surface)' }} /></Field>
        <Field label="Times every (minutes)" htmlFor="rs"><input id="rs" type="number" min={15} step={15} value={r.slot_minutes} onChange={num('slot_minutes')} /></Field>
      </div>
      <div className="grid3">
        <Field label="Booking lasts (minutes)" htmlFor="rd"><input id="rd" type="number" min={30} step={15} value={r.duration_minutes} onChange={num('duration_minutes')} /></Field>
        <Field label="Most guests at once" hint="All tables together" htmlFor="rm"><input id="rm" type="number" min={1} value={r.max_covers} onChange={num('max_covers')} /></Field>
        <Field label="Largest group online" hint="Bigger groups contact you" htmlFor="rp"><input id="rp" type="number" min={1} value={r.max_party} onChange={num('max_party')} /></Field>
      </div>
      <div className="grid2">
        <Field label="Ask for a deposit from groups of" htmlFor="rdp"><input id="rdp" type="number" min={0} value={r.deposit_over_party} onChange={num('deposit_over_party')} /></Field>
        <Field label="Deposit amount" htmlFor="rda"><MoneyInput id="rda" value={r.deposit_amount} onChange={v => set({ deposit_amount: v ?? 0 })} /></Field>
      </div>
      <div><button className="btn primary" onClick={() => { update(d => { d.store.settings = { ...d.store.settings, reservations: r } }); toast('Booking rules saved') }}>Save rules</button></div>
    </div>
  )
}
