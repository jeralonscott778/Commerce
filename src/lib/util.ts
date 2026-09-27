const SYMBOL: Record<string, string> = { GHS: 'GH₵', NGN: '₦', USD: '$' }
let CURRENCY = 'GHS'
export const setCurrency = (c: string) => { CURRENCY = c }

export const money = (n: number, decimals = 2) =>
  (SYMBOL[CURRENCY] ?? '') + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
export const money0 = (n: number) => money(n, 0)
export const currencySymbol = () => SYMBOL[CURRENCY] ?? ''

export const uid = (_prefix = ''): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16) })
}
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
export const initials = (s: string) =>
  s.split(/\s+/).filter(w => /[A-Za-z]/.test(w[0] ?? '')).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

export const today = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d }
export const addDays = (n: number, from = today()) => { const d = new Date(from); d.setDate(d.getDate() + n); return d }
export const isoDay = (d: Date | string) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const fDate = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const fShort = (d: string | Date) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
export const fTime = (d: string | Date) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
export const fDateTime = (d: string | Date) => {
  const x = new Date(d)
  const t = today()
  if (isoDay(x) === isoDay(t)) return 'Today at ' + fTime(x)
  if (isoDay(x) === isoDay(addDays(-1))) return 'Yesterday at ' + fTime(x)
  return fShort(x) + ' at ' + fTime(x)
}
export const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / b) * 100)

export const randomCode = (len = 8) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ---------- CSV ----------
export function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n')
}

export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim()))
  if (!head) return []
  return body.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

/** Saves a text file. Works in the real app; some preview windows block downloads. */
export function downloadFile(name: string, content: string, type = 'text/csv') {
  try {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    return true
  } catch { return false }
}

export const readFileText = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(f)
})
export const readFileDataURL = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f)
})

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
