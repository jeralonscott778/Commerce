import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, Link, useNavigate } from 'react-router-dom'
import { LayoutGrid, ShoppingCart, Tag, Users, BadgePercent, Store, MessageCircle, MonitorSmartphone, Settings, Bell, CalendarDays, Menu as MenuIcon, RotateCcw, BarChart3, ChefHat, CalendarClock, IdCard, ChevronLeft, ChevronRight, LogOut, Plus } from 'lucide-react'
import { useData } from '../data/store'
import { Menu } from './ui'
import { ago, cx } from '../lib/util'

type Item = { to: string; label: string; icon: typeof LayoutGrid; count?: number; dot?: boolean; sub?: { to: string; label: string }[] }

export default function Layout() {
  const { data, stores, storeId, setStoreId, update, resetDemo, live, saving, userEmail, api } = useData()
  const loc = useLocation()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('stockroom-collapsed') === '1' } catch { return false } })
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])
  useEffect(() => { document.documentElement.style.setProperty('--accent', data.store.accent) }, [data.store.accent])
  const toggle = () => setCollapsed(c => { try { localStorage.setItem('stockroom-collapsed', c ? '0' : '1') } catch { /* ignore */ } return !c })

  const restaurant = data.store.businessType === 'restaurant'
  const toFulfil = data.orders.filter(o => o.fulfilmentStatus === 'unfulfilled' && !o.kitchenStatus).length
  const kitchen = data.orders.filter(o => o.kitchenStatus === 'new').length
  const waiting = data.waConversations.filter(c => c.needsHuman).length
  const unread = data.notifications.filter(n => !n.read).length

  const main: Item[] = [
    { to: '/', label: 'Overview', icon: LayoutGrid },
    { to: '/orders', label: 'Orders', icon: ShoppingCart, count: toFulfil, sub: [{ to: '/orders/drafts', label: 'Drafts' }, { to: '/orders/abandoned', label: 'Abandoned checkouts' }] },
    { to: '/products', label: restaurant ? 'Menu' : 'Products', icon: Tag, sub: [{ to: '/collections', label: restaurant ? 'Categories' : 'Collections' }, { to: '/inventory', label: 'Inventory' }, { to: '/gift-cards', label: 'Gift cards' }] },
    { to: '/customers', label: 'Customers', icon: Users },
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/discounts', label: 'Discounts', icon: BadgePercent },
  ]
  const channels: Item[] = [
    { to: '/online-store', label: 'Online store', icon: Store, sub: [{ to: '/online-store/pages', label: 'Pages' }, { to: '/online-store/preferences', label: 'Preferences' }] },
    { to: '/pos', label: 'Point of sale', icon: MonitorSmartphone },
    { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, count: waiting },
  ]
  const venue: Item[] = restaurant ? [
    { to: '/kitchen', label: 'Kitchen', icon: ChefHat, count: kitchen },
    { to: '/reservations', label: 'Reservations', icon: CalendarClock },
    { to: '/staff', label: 'Staff & shifts', icon: IdCard },
  ] : data.posStaff.length ? [{ to: '/staff', label: 'Staff & shifts', icon: IdCard }] : []

  const isActive = (it: Item) => it.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(it.to) || !!it.sub?.some(s => loc.pathname.startsWith(s.to))
  const renderItem = (it: Item) => {
    const active = isActive(it)
    return (
      <div key={it.to}>
        <NavLink to={it.to} end={it.to === '/'} className={cx('nav-item', active && 'active')} title={collapsed ? it.label : undefined}>
          <it.icon /><span className="nav-label">{it.label}</span>
          {!!it.count && <span className="badge-count">{it.count}</span>}
        </NavLink>
        {active && it.sub && !collapsed && <div className="nav-sub">{it.sub.map(s => <NavLink key={s.to} to={s.to}>{s.label}</NavLink>)}</div>}
      </div>
    )
  }

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const me = live ? (data.staff.find(s => s.email.toLowerCase() === userEmail.toLowerCase())?.name || userEmail.split('@')[0]) : (data.staff.find(s => s.role === 'owner')?.name ?? 'there')
  const first = me.split(' ')[0]
  const fullBleed = loc.pathname.startsWith('/pos')

  return (
    <div className={cx('shell', collapsed && 'collapsed')}>
      <aside className={cx('sidebar', open && 'open')}>
        <div className="brand">
          <div className="brand-mark">{data.store.initials}</div>
          <div className="nav-label"><b>{data.store.name}</b><span>{data.store.tagline || 'Store admin'}</span></div>
        </div>
        <button className="collapse-btn" onClick={toggle} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}>{collapsed ? <ChevronRight /> : <ChevronLeft />}</button>
        {(stores.length > 1 || live) && !collapsed && (
          <div className="store-select">
            <select value={storeId} onChange={e => e.target.value === '__new' ? nav('/new-store') : setStoreId(e.target.value)} aria-label="Switch store">
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              {live && <option value="__new">+ Add another store…</option>}
            </select>
          </div>
        )}
        <nav className="nav-group"><span className="label">Main Menu</span>{main.map(renderItem)}</nav>
        <nav className="nav-group"><span className="label">Sales Channel</span>{channels.map(renderItem)}</nav>
        {venue.length > 0 && <nav className="nav-group"><span className="label">{restaurant ? 'Restaurant' : 'Team'}</span>{venue.map(renderItem)}</nav>}
        <nav className="nav-group" style={{ marginTop: 'auto' }}>{renderItem({ to: '/settings', label: 'Settings', icon: Settings, sub: [{ to: '/settings/delivery', label: 'Delivery' }, { to: '/settings/payments', label: 'Payments' }, { to: '/settings/team', label: 'Team' }] })}</nav>
        {!live && !collapsed && <div className="sidebar-foot">Sample data. Nothing here is connected to a live store.</div>}
      </aside>
      {open && <div className="side-scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="round-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><MenuIcon /></button>
          <div className="greet">
            {loc.pathname === '/' ? <><h1>{greet}, {first}!</h1><p>Here’s what’s happening with your store today</p></> : null}
          </div>
          <div className="spacer" />
          {live && <span className={cx('saving', saving && 'busy')}><i />{saving ? 'Saving…' : 'All changes saved'}</span>}
          <div className="date-pill"><CalendarDays />{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          <Menu className="notif" trigger={t => (
            <button className="round-btn" onClick={t} aria-label={`Notifications, ${unread} unread`}><Bell />{unread > 0 && <span className="dot">{unread}</span>}</button>
          )}>
            {close => <>
              <header><b>Notifications</b>{unread > 0 && <button className="btn ghost sm" onClick={() => update(d => d.notifications.forEach(n => (n.read = true)))}>Mark all read</button>}</header>
              {data.notifications.slice(0, 8).map(n => (
                <Link key={n.id} to={n.link} className={cx(!n.read && 'unread')} onClick={() => { update(d => { const x = d.notifications.find(y => y.id === n.id); if (x) x.read = true }); close() }}>
                  <span>{n.text}</span><span className="xs muted">{ago(n.at)}</span>
                </Link>
              ))}
              {!data.notifications.length && <div className="empty">No notifications yet</div>}
            </>}
          </Menu>
          <Menu trigger={t => <button className="avatar-btn" onClick={t} aria-label="Account menu"><span className="avatar">{first[0]?.toUpperCase()}</span></button>}>
            {close => <>
              <div className="small muted" style={{ padding: '6px 10px' }}>{live ? userEmail : 'Demo mode'}</div>
              <Link to="/settings" onClick={close}><Settings size={16} />Store settings</Link>
              {live && <Link to="/new-store" onClick={close}><Plus size={16} />Add another store</Link>}
              <div className="sep" />
              {live ? <button onClick={() => { api.signOut(); close() }}><LogOut />Sign out</button> : <button onClick={() => { resetDemo(); close() }}><RotateCcw />Reset sample data</button>}
            </>}
          </Menu>
        </header>
        <main className={cx('content', fullBleed && 'full')} key={storeId + loc.pathname.split('/').slice(0, 3).join('/')}><Outlet /></main>
      </div>
    </div>
  )
}
