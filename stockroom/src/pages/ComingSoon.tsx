import { useParams } from 'react-router-dom'
import { MessageCircle, MonitorSmartphone } from 'lucide-react'
import { PageHead } from '../components/ui'

const INFO = {
  whatsapp: { title: 'WhatsApp orders', icon: MessageCircle, points: ['Customers text your business number to see the menu or products', 'The bot takes the order, totals it and sends a MoMo payment link', 'Orders land here, marked “WhatsApp”, like any other order', 'Abandoned-cart reminders sent automatically'] },
  pos: { title: 'Point of sale', icon: MonitorSmartphone, points: ['Sell in person from a tablet or phone', 'Staff sign in with a PIN and track their own sales for the shift', 'Tables, kitchen screen and reservations for restaurants and cafés', 'Keeps working during power or internet cuts, then syncs'] },
}

export default function ComingSoon() {
  const { what } = useParams()
  const i = INFO[(what as keyof typeof INFO) ?? 'pos'] ?? INFO.pos
  return (
    <>
      <PageHead title={i.title} subtitle="Planned for a later phase." />
      <section className="card"><div className="card-body">
        <div className="row"><div className="kpi" style={{ border: 0, padding: 0 }}><div className="ic"><i.icon /></div></div><h2>What this will do</h2></div>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>{i.points.map(p => <li key={p}>{p}</li>)}</ul>
      </div></section>
    </>
  )
}
