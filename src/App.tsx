import { HashRouter, Route, Routes, Navigate } from 'react-router-dom'
import { DataProvider, ToastProvider } from './data/store'
import Layout from './components/Layout'
import Overview from './pages/Overview'
import Orders from './pages/orders/Orders'
import OrderDetail from './pages/orders/OrderDetail'
import CreateOrder from './pages/orders/CreateOrder'
import { Drafts, Abandoned } from './pages/orders/DraftsAbandoned'
import Products from './pages/products/Products'
import ProductEditor from './pages/products/ProductEditor'
import { Collections, Inventory, GiftCards } from './pages/products/Catalog'
import Customers from './pages/customers/Customers'
import CustomerDetail from './pages/customers/CustomerDetail'
import { Discounts, DiscountEditor } from './pages/Discounts'
import { OnlineStore, Pages, Preferences } from './pages/OnlineStore'
import { General, Delivery, Payments, Team } from './pages/Settings'
import ComingSoon from './pages/ComingSoon'
import Analytics from './pages/Analytics'
import Pos from './pages/pos/Pos'
import Kitchen from './pages/restaurant/Kitchen'
import Reservations from './pages/restaurant/Reservations'
import Staff from './pages/restaurant/Staff'
import WhatsApp from './pages/WhatsApp'
import NewStore from './pages/NewStore'

export default function App() {
  return (
    <ToastProvider>
      <DataProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="orders" element={<Orders />} />
              <Route path="orders/new" element={<CreateOrder key="new" />} />
              <Route path="orders/drafts" element={<Drafts />} />
              <Route path="orders/drafts/:draftId" element={<CreateOrder />} />
              <Route path="orders/abandoned" element={<Abandoned />} />
              <Route path="orders/:id" element={<OrderDetail />} />
              <Route path="products" element={<Products />} />
              <Route path="products/:id" element={<ProductEditor />} />
              <Route path="collections" element={<Collections />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="gift-cards" element={<GiftCards />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:id" element={<CustomerDetail />} />
              <Route path="discounts" element={<Discounts />} />
              <Route path="discounts/:id" element={<DiscountEditor />} />
              <Route path="online-store" element={<OnlineStore />} />
              <Route path="online-store/pages" element={<Pages />} />
              <Route path="online-store/preferences" element={<Preferences />} />
              <Route path="settings" element={<General />} />
              <Route path="settings/delivery" element={<Delivery />} />
              <Route path="settings/payments" element={<Payments />} />
              <Route path="settings/team" element={<Team />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="pos" element={<Pos />} />
              <Route path="kitchen" element={<Kitchen />} />
              <Route path="reservations" element={<Reservations />} />
              <Route path="staff" element={<Staff />} />
              <Route path="whatsapp" element={<WhatsApp />} />
              <Route path="new-store" element={<NewStore />} />
              <Route path="coming/:what" element={<ComingSoon />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </DataProvider>
    </ToastProvider>
  )
}
