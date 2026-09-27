// Till staff, their PINs, shifts and sales.
import { useState } from 'react'
import { Plus, KeyRound } from 'lucide-react'
import { useData, useToast } from '../../data/store'
import type { PosStaff } from '../../data/types'
import { PageHead, Tabs, Badge, Modal, Field, Empty, Switch } from '../../components/ui'
import { shiftStats } from '../pos/Pos'
import { addDays, fShort, fTime, isoDay, money, money0, uid } from '../../lib/util'

export default function Staff() {
  const [tab, setTab] = useState<'today' | 'people' | 'shifts'>('today')
  return (
    <>
      <PageHead title="Staff & shifts" subtitle="Who’s working, what each person has sold, and whether the cash adds up." />
      <section className="card"><Tabs value={tab} onChange={setTab} tabs={[{ key: 'today', label: 'Today' }, { key: 'people', label: 'People & PINs' }, { key: 'shifts', label: 'Shift history' }]} />
        {tab === 'today' && <Today />}{tab === 'people' && <People />}{tab === 'shifts' && <History />}
      </section>
    </>
  )
}

function Today() {
  const { data } = useData()
  const t = isoDay(new Date())
  const shifts = data.shifts.filter(s => isoDay(s.startedAt) === t)
  const rows = shifts.map(s => ({ s, st: shiftStats(data.orders, s) })).sort((a, b) => b.st.sales - a.st.sales)
  const max = Math.max(1, ...rows.map(r => r.st.sales))
  if (!rows.length) return <Empty title="Nobody has started a shift today" />
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Staff</th><th>Clocked in</th><th>Sales</th><th className="r">Orders</th><th className="r">Items</th><th className="r">Tips</th><th className="r">Open tabs</th><th>Status</th></tr></thead>
      <tbody>{rows.map(({ s, st }, i) => (
        <tr key={s.id}>
          <td><div className="cell"><div className="avatar sm">{i + 1}</div><b style={{ fontWeight: 500 }}>{s.staffName}</b></div></td>
          <td className="muted">{fTime(s.startedAt)}{s.endedAt && ` – ${fTime(s.endedAt)}`}</td>
          <td style={{ minWidth: 180 }}><div className="row"><span className="num strong">{money0(st.sales)}</span><div className="bar grow"><i style={{ width: `${(st.sales / max) * 100}%` }} /></div></div></td>
          <td className="r num">{st.orders}</td><td className="r num">{st.items}</td><td className="r num">{money0(st.tips)}</td><td className="r num">{st.open}</td>
          <td>{s.endedAt ? <Badge>Finished</Badge> : <Badge tone="good">On shift</Badge>}</td>
        </tr>
      ))}</tbody>
    </table></div>
  )
}

function People() {
  const { data, update, api } = useData()
  const toast = useToast()
  const [edit, setEdit] = useState<(PosStaff & { newPin?: string }) | null>(null)
  const save = async () => {
    if (!edit) return
    if (!edit.name.trim()) return toast('Add a name')
    const isNew = !edit.id
    if (isNew && !/^\d{4,6}$/.test(edit.newPin ?? '')) return toast('Set a 4 to 6 digit PIN')
    if (edit.newPin && !/^\d{4,6}$/.test(edit.newPin)) return toast('PIN must be 4 to 6 digits')
    const id = edit.id || uid()
    const { newPin, ...rest } = edit
    update(d => { const i = d.posStaff.findIndex(x => x.id === id); const row = { ...rest, id }; if (i >= 0) d.posStaff[i] = { ...d.posStaff[i], ...row }; else d.posStaff.push(row) })
    if (newPin) {
      // wait for the new person to be saved before setting their PIN
      api.flush().then(() => api.setStaffPin(id, newPin)).then(() => toast(`PIN set for ${rest.name}`)).catch(e => toast(`Couldn’t set PIN: ${(e as Error).message}`))
    }
    toast(isNew ? `${rest.name} added` : 'Saved'); setEdit(null)
  }
  return (
    <div className="card-body">
      <div className="row between"><span className="small muted">Everyone who uses the till gets their own PIN, so sales are counted under the right name.</span>
        <button className="btn primary sm" onClick={() => setEdit({ id: '', storeId: data.store.id, name: '', role: 'cashier', active: true, newPin: '' })}><Plus />Add staff</button></div>
      <div className="table-wrap" style={{ margin: '0 -20px' }}><table>
        <thead><tr><th>Name</th><th>Role</th><th>Sales (7 days)</th><th>Active</th><th></th></tr></thead>
        <tbody>{data.posStaff.map(s => {
          const week = data.orders.filter(o => o.staffId === s.id && new Date(o.createdAt) >= addDays(-7) && o.paymentStatus === 'paid').reduce((a, o) => a + o.total, 0)
          return (
            <tr key={s.id}>
              <td><div className="cell"><div className="avatar sm">{s.name.split(' ').map(x => x[0]).slice(0, 2).join('')}</div><b style={{ fontWeight: 500 }}>{s.name}</b></div></td>
              <td style={{ textTransform: 'capitalize' }}>{s.role}</td>
              <td className="num">{money0(week)}</td>
              <td><Switch label={`${s.name} can use the till`} checked={s.active} onChange={v => update(d => { const x = d.posStaff.find(y => y.id === s.id); if (x) x.active = v })} /></td>
              <td className="r"><button className="btn sm" onClick={() => setEdit({ ...s, newPin: '' })}><KeyRound />Edit / reset PIN</button></td>
            </tr>
          )
        })}</tbody>
      </table>{!data.posStaff.length && <Empty title="No till staff yet" />}</div>
      {edit && (
        <Modal title={edit.id ? edit.name : 'Add staff'} onClose={() => setEdit(null)} footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          <Field label="Name" htmlFor="sn"><input id="sn" type="text" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Role" htmlFor="sr"><select id="sr" value={edit.role} onChange={e => setEdit({ ...edit, role: e.target.value as PosStaff['role'] })}><option value="cashier">Cashier</option><option value="waiter">Waiter</option><option value="kitchen">Kitchen</option><option value="manager">Manager</option></select></Field>
          <Field label={edit.id ? 'New PIN (leave empty to keep the current one)' : 'PIN'} hint="4 to 6 digits. They type this on the till." htmlFor="sp"><input id="sp" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={edit.newPin ?? ''} onChange={e => setEdit({ ...edit, newPin: e.target.value.replace(/\D/g, '') })} /></Field>
        </Modal>
      )}
    </div>
  )
}

function History() {
  const { data } = useData()
  const list = data.shifts.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 100)
  if (!list.length) return <Empty title="No shifts yet" />
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Day</th><th>Staff</th><th>Hours</th><th className="r">Sales</th><th className="r">Cash expected</th><th className="r">Counted</th><th>Difference</th></tr></thead>
      <tbody>{list.map(s => {
        const st = shiftStats(data.orders, s)
        const diff = s.cashCounted != null && s.expectedCash != null ? s.cashCounted - s.expectedCash : null
        const hrs = ((s.endedAt ? new Date(s.endedAt) : new Date()).getTime() - new Date(s.startedAt).getTime()) / 3600000
        return (
          <tr key={s.id}>
            <td className="muted">{fShort(s.startedAt)}</td><td>{s.staffName}</td>
            <td className="muted">{fTime(s.startedAt)} – {s.endedAt ? fTime(s.endedAt) : 'now'} <span className="xs">({hrs.toFixed(1)} h)</span></td>
            <td className="r num">{money0(st.sales)}</td>
            <td className="r num">{s.expectedCash != null ? money(s.expectedCash) : '—'}</td>
            <td className="r num">{s.cashCounted != null ? money(s.cashCounted) : '—'}</td>
            <td>{diff == null ? <Badge tone="good">On shift</Badge> : Math.abs(diff) < 1 ? <Badge tone="good">Balanced</Badge> : <Badge tone={diff < 0 ? 'bad' : 'warn'}>{diff < 0 ? 'Short' : 'Over'} {money0(Math.abs(diff))}</Badge>}{s.note && <div className="xs muted">{s.note}</div>}</td>
          </tr>
        )
      })}</tbody>
    </table></div>
  )
}
