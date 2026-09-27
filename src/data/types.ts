// Shapes of everything the dashboard works with.
// These match the database tables in supabase/migrations/0001_init.sql.

export type ID = string

export interface Store {
  id: ID
  name: string
  tagline: string
  initials: string
  accent: string
  domain: string
  email: string
  phone: string
  address: string
  currency: 'GHS' | 'NGN' | 'USD'
  lowStockAt: number
  taxRate: number
  taxIncluded: boolean
  businessType: 'retail' | 'restaurant' | 'services'
  storefront: {
    public: boolean // false = password / "coming soon" page
    password: string
    seoTitle: string
    seoDescription: string
    announcement: string
    announcementOn: boolean
    heroTitle: string
    heroText: string
    heroButton: string
    featuredCollectionId: ID | null
    whatsapp: string
    instagram: string
  }
  freeDeliveryOver: number | null
  settings: StoreSettings
}

export interface StoreSettings {
  reservations?: { enabled: boolean; opens: string; closes: string; slot_minutes: number; duration_minutes: number; max_covers: number; max_party: number; deposit_over_party: number; deposit_amount: number }
  pos?: { serviceChargePct: number; askTip: boolean; lockMinutes: number }
  whatsapp?: { enabled: boolean; phoneNumberId: string; displayNumber: string; mode: 'chat' | 'link'; greeting: string; verifyToken?: string; apiVersion?: string }
}

export interface ModifierGroup { name: string; required: boolean; max: number; choices: { name: string; price: number }[] }

export interface OptionDef { name: string; values: string[] }

export interface Variant {
  id: ID
  title: string // e.g. "M / Black"
  options: string[] // values in the same order as product.options
  sku: string
  price: number
  compareAt: number | null
  cost: number | null
  stock: number
  trackStock: boolean
}

export interface Product {
  id: ID
  storeId: ID
  title: string
  description: string
  status: 'active' | 'draft' | 'archived'
  images: string[] // URLs or data URLs
  hue: number // used for placeholder thumbnails
  category: string
  productType: string
  vendor: string
  tags: string[]
  collectionIds: ID[]
  options: OptionDef[]
  modifiers: ModifierGroup[]
  variants: Variant[]
  seoTitle: string
  seoDescription: string
  handle: string
  createdAt: string
  updatedAt: string
}

export interface Collection {
  id: ID
  storeId: ID
  title: string
  description: string
  visible: boolean
  handle: string
}

export interface Address {
  line1: string
  city: string
  region: string
  country: string
}

export interface Customer {
  id: ID
  storeId: ID
  firstName: string
  lastName: string
  email: string
  phone: string
  address: Address
  acceptsEmail: boolean
  acceptsWhatsApp: boolean
  tags: string[]
  note: string
  createdAt: string
}

export type Channel = 'online' | 'whatsapp' | 'pos' | 'phone' | 'instagram' | 'walk-in'
export type PaymentStatus = 'paid' | 'pending' | 'partially_refunded' | 'refunded' | 'voided'
export type FulfilmentStatus = 'unfulfilled' | 'fulfilled' | 'cancelled'
export type DeliveryStatus = 'none' | 'packed' | 'out_for_delivery' | 'delivered' | 'picked_up'
export type PaymentMethod = 'paystack_momo' | 'paystack_card' | 'flutterwave' | 'stripe' | 'cash' | 'momo_manual' | 'bank_transfer' | 'gift_card'

export interface LineItem {
  productId: ID
  variantId: ID
  title: string
  variantTitle: string
  price: number
  qty: number
  hue: number
  image?: string
  modifiers?: { name: string; price: number }[]
  note?: string
}

export interface TimelineEvent { at: string; text: string; by?: string }

export interface Order {
  id: ID
  storeId: ID
  number: number
  createdAt: string
  customerId: ID | null
  customerName: string
  phone: string
  email: string
  address: Address
  channel: Channel
  service: 'delivery' | 'pickup' | 'dine_in' | 'takeaway'
  items: LineItem[]
  subtotal: number
  discountCode: string | null
  discountAmount: number
  giftCardCode: string | null
  giftCardAmount: number
  deliveryMethod: string // zone name or "Store pickup"
  deliveryFee: number
  serviceCharge: number
  tip: number
  tax: number
  total: number
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  paymentReference?: string | null
  refunded: number
  fulfilmentStatus: FulfilmentStatus
  deliveryStatus: DeliveryStatus
  kitchenStatus: 'new' | 'preparing' | 'ready' | 'served' | null
  tableId: ID | null
  carrier: string
  tracking: string
  tags: string[]
  note: string
  staff: string | null
  staffId: ID | null
  shiftId: ID | null
  timeline: TimelineEvent[]
}

export interface DraftOrder {
  id: ID
  storeId: ID
  number: number
  createdAt: string
  customerId: ID | null
  customerName: string
  phone: string
  items: LineItem[]
  discountAmount: number
  deliveryMethod: string
  deliveryFee: number
  note: string
  channel: Channel
}

export interface AbandonedCheckout {
  id: ID
  storeId: ID
  createdAt: string
  customerName: string
  phone: string
  email: string
  items: LineItem[]
  total: number
  remindedAt: string | null
  recovered: boolean
  completed?: boolean
  orderId?: string | null
  provider?: string
  payload?: unknown
}

export type DiscountType = 'percent' | 'fixed' | 'free_delivery' | 'buy_x_get_y'

export interface Discount {
  id: ID
  storeId: ID
  method: 'code' | 'automatic'
  code: string
  title: string
  type: DiscountType
  value: number
  buyQty: number
  getQty: number
  appliesTo: 'all' | ID // collection id
  minSpend: number
  eligibility: 'everyone' | 'first_order'
  usageLimit: number // 0 = unlimited
  oncePerCustomer: boolean
  startsAt: string // yyyy-mm-dd
  endsAt: string // '' = no end
  paused: boolean
  uses: number
}

export interface GiftCard {
  id: ID
  storeId: ID
  code: string
  initialValue: number
  balance: number
  customerId: ID | null
  customerName: string
  expiresAt: string // '' = never
  disabled: boolean
  note: string
  createdAt: string
}

export interface Segment {
  id: ID
  storeId: ID
  name: string
  rule: SegmentRule
}

export type SegmentRule =
  | { kind: 'spent_over'; amount: number }
  | { kind: 'orders_at_least'; count: number }
  | { kind: 'no_order_days'; days: number }
  | { kind: 'city'; city: string }
  | { kind: 'accepts_marketing' }
  | { kind: 'tag'; tag: string }

export interface DeliveryZone {
  id: ID
  storeId: ID
  name: string
  areas: string
  fee: number
  eta: string
  active: boolean
}

export interface PaymentProvider {
  key: 'paystack' | 'flutterwave' | 'stripe' | 'cod'
  enabled: boolean
  testMode: boolean
  publicKey: string
  codFee?: number
  codZones?: string[]
}

export interface StaffMember {
  id: ID
  name: string
  email: string
  role: 'owner' | 'admin' | 'orders' | 'products' | 'marketing' | 'developer'
  invited: boolean
}

export interface Page {
  id: ID
  title: string
  body: string
  visible: boolean
}

export interface Notification {
  id: ID
  at: string
  text: string
  link: string
  read: boolean
}

export interface PosStaff { id: ID; storeId: ID; name: string; role: 'cashier' | 'waiter' | 'kitchen' | 'manager'; active: boolean; pin?: string }
export interface Shift { id: ID; storeId: ID; staffId: ID; staffName: string; startedAt: string; endedAt: string | null; openingFloat: number; cashCounted: number | null; expectedCash: number | null; note: string }
export interface DiningTable { id: ID; storeId: ID; name: string; area: string; seats: number; status: 'free' | 'seated' | 'ordered' | 'bill' | 'reserved'; position: number }
export interface Reservation { id: ID; storeId: ID; name: string; phone: string; email: string; partySize: number; startsAt: string; durationMin: number; tableId: ID | null; status: 'booked' | 'seated' | 'completed' | 'cancelled' | 'no_show'; depositAmount: number; depositPaid: boolean; notes: string; source: string; createdAt: string }
export interface WaConversation { id: ID; storeId: ID; phone: string; name: string; needsHuman: boolean; lastMessageAt: string; state: Record<string, unknown> }
export interface WaMessage { id: ID; storeId: ID; conversationId: ID; direction: 'in' | 'out'; body: string; at: string }

export interface StoreData {
  store: Store
  products: Product[]
  collections: Collection[]
  customers: Customer[]
  orders: Order[]
  drafts: DraftOrder[]
  abandoned: AbandonedCheckout[]
  discounts: Discount[]
  giftCards: GiftCard[]
  segments: Segment[]
  zones: DeliveryZone[]
  payments: PaymentProvider[]
  staff: StaffMember[]
  pages: Page[]
  notifications: Notification[]
  posStaff: PosStaff[]
  shifts: Shift[]
  tables: DiningTable[]
  reservations: Reservation[]
  waConversations: WaConversation[]
  waMessages: WaMessage[]
}
