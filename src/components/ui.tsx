import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Search, X, Inbox } from 'lucide-react'
import { cx, initials, currencySymbol } from '../lib/util'

export function PageHead({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="page-head">
      <div className="title">
        {back && <button className="back-link" onClick={() => nav(back.to)}><ChevronLeft />{back.label}</button>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  )
}

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'
export const Badge = ({ tone = 'neutral', children, plain }: { tone?: Tone; children: ReactNode; plain?: boolean }) =>
  <span className={cx('badge', tone !== 'neutral' && tone, plain && 'plain')}>{children}</span>

export function Thumb({ title, hue, image, size }: { title: string; hue: number; image?: string; size?: 'sm' | 'xl' }) {
  return (
    <div className={cx('thumb', size)} style={{ ['--h' as string]: hue }}>
      {image ? <img src={image} alt="" /> : initials(title || 'New')}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  )
}

export function Field({ label, hint, error, children, htmlFor }: { label?: ReactNode; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

export function MoneyInput({ id, value, onChange, placeholder }: { id?: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <div className="input-group">
      <span>{currencySymbol()}</span>
      <input id={id} type="number" min={0} step="0.01" inputMode="decimal" value={value ?? ''} placeholder={placeholder}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    </div>
  )
}

/** Asks for a second click before doing something that can't be undone. */
export function ConfirmButton({ onConfirm, children, confirmText = 'Click again to confirm', className = 'btn danger' }: { onConfirm: () => void; children: ReactNode; confirmText?: string; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t) }, [armed])
  return <button type="button" className={cx(className, armed && 'armed')} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>{armed ? confirmText : children}</button>
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', wide && 'wide')} role="dialog" aria-modal="true">
        <header><h2>{title}</h2><button className="btn ghost sm icon" onClick={onClose} aria-label="Close"><X /></button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}

/** A button that opens a small menu. Closes on outside click. */
export function Menu({ trigger, children, className }: { trigger: (open: () => void) => ReactNode; children: (close: () => void) => ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', h); window.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('keydown', k) }
  }, [open])
  return (
    <div className="rel" ref={ref}>
      {trigger(() => setOpen(o => !o))}
      {open && <div className={cx('popover', className)}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search">
      <Search />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.key} role="tab" aria-selected={value === t.key} className={cx(value === t.key && 'on')} onClick={() => onChange(t.key)}>
          {t.label}{t.count != null && <span className="n">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Empty({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return <div className="empty">{icon ?? <Inbox />}<b>{title}</b>{children}</div>
}

/** Tick-box selection for tables with bulk actions. */
export function useSelection(ids: string[]) {
  const [sel, setSel] = useState<Set<string>>(new Set())
  const visible = useMemo(() => new Set(ids), [ids])
  const selected = [...sel].filter(id => visible.has(id))
  const all = ids.length > 0 && selected.length === ids.length
  return {
    selected,
    has: (id: string) => sel.has(id),
    toggle: (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }),
    toggleAll: () => setSel(all ? new Set() : new Set(ids)),
    clear: () => setSel(new Set()),
    all,
    some: selected.length > 0 && !all,
  }
}

export function CheckAll({ all, some, onChange }: { all: boolean; some: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = some }, [some])
  return <input ref={ref} type="checkbox" checked={all} onChange={onChange} aria-label="Select all" />
}

export function TagInput({ tags, onChange, placeholder = 'Add a tag and press Enter' }: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
  const [v, setV] = useState('')
  const add = () => { const t = v.trim(); if (t && !tags.includes(t)) onChange([...tags, t]); setV('') }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <input type="text" value={v} placeholder={placeholder} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }} onBlur={add} />
      {tags.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{tags.map(t => <span key={t} className="tag">{t}<button type="button" onClick={() => onChange(tags.filter(x => x !== t))} aria-label={`Remove ${t}`}><X /></button></span>)}</div>}
    </div>
  )
}

export function Delta({ value }: { value: number }) {
  if (!isFinite(value)) return null
  return <span className={cx('delta', value >= 0 ? 'up' : 'down')}>{value >= 0 ? '+' : ''}{value.toFixed(1)}%</span>
}
