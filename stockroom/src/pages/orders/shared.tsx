import { Globe, MessageCircle, MonitorSmartphone, Phone, Instagram, Footprints } from 'lucide-react'
import type { Channel, Order } from '../../data/types'
import { CHANNEL_LABEL, DELIVERY_LABEL, PAYMENT_LABEL } from '../../data/logic'
import { Badge, type Tone } from '../../components/ui'

const CH_ICON = { online: Globe, whatsapp: MessageCircle, pos: MonitorSmartphone, phone: Phone, instagram: Instagram, 'walk-in': Footprints }
const CH_COLOR: Record<Channel, string> = { online: 'var(--blue)', whatsapp: '#22A35A', pos: 'var(--ink-2)', phone: 'var(--ink-2)', instagram: '#D6336C', 'walk-in': 'var(--ink-2)' }

export function ChannelChip({ channel }: { channel: Channel }) {
  const I = CH_ICON[channel]
  return <span className="chip"><I style={{ color: CH_COLOR[channel] }} />{CHANNEL_LABEL[channel]}</span>
}

export function PaymentBadge({ o }: { o: Order }) {
  const tone: Tone = o.paymentStatus === 'paid' ? 'good' : o.paymentStatus === 'pending' ? 'warn' : o.paymentStatus === 'refunded' || o.paymentStatus === 'partially_refunded' ? 'info' : 'neutral'
  const label = o.paymentStatus === 'pending' && o.paymentMethod === 'cash' ? 'Cash on delivery' : PAYMENT_LABEL[o.paymentStatus]
  return <Badge tone={tone}>{label}</Badge>
}
export function FulfilBadge({ o }: { o: Order }) {
  if (o.fulfilmentStatus === 'cancelled') return <Badge>Cancelled</Badge>
  return o.fulfilmentStatus === 'fulfilled' ? <Badge>Fulfilled</Badge> : <Badge tone="warn">Unfulfilled</Badge>
}
export function DeliveryBadge({ o }: { o: Order }) {
  if (o.fulfilmentStatus === 'cancelled') return <span className="faint">—</span>
  const tone: Tone = o.deliveryStatus === 'delivered' || o.deliveryStatus === 'picked_up' ? 'good' : o.deliveryStatus === 'out_for_delivery' ? 'info' : o.deliveryStatus === 'packed' ? 'warn' : 'neutral'
  return <Badge tone={tone} plain={o.deliveryStatus === 'none'}>{DELIVERY_LABEL[o.deliveryStatus]}</Badge>
}
