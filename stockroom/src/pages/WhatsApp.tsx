// WhatsApp inbox (see what the bot and customers said, reply yourself) and set-up.
import { useEffect, useRef, useState } from 'react'
import { Send, Bot, UserRound, MessageCircle, Copy } from 'lucide-react'
import { useData, useToast } from '../data/store'
import type { StoreSettings } from '../data/types'
import { PageHead, Tabs, Badge, Empty, Field, Switch } from '../components/ui'
import { ago, cx, fTime, uid } from '../lib/util'
import { supabase } from '../lib/supabase'

export default function WhatsApp() {
  const [tab, setTab] = useState<'inbox' | 'setup'>('inbox')
  return (
    <>
      <PageHead title="WhatsApp orders" subtitle="Customers order by chatting with your business number. The bot takes the order; you step in when needed." />
      <section className="card"><Tabs value={tab} onChange={setTab} tabs={[{ key: 'inbox', label: 'Inbox' }, { key: 'setup', label: 'Set up' }]} />
        {tab === 'inbox' ? <Inbox /> : <Setup />}
      </section>
    </>
  )
}

function Inbox() {
  const { data, update, live } = useData()
  const toast = useToast()
  const [sel, setSel] = useState<string | null>(data.waConversations[0]?.id ?? null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const conv = data.waConversations.find(c => c.id === sel)
  const msgs = data.waMessages.filter(m => m.conversationId === sel)
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [sel, msgs.length])

  const call = async (body: Record<string, unknown>) => {
    const { data: r, error } = await supabase!.functions.invoke('whatsapp/send', { body })
    if (error) throw error
    if (r?.error) throw new Error(r.error)
  }
  const reply = async () => {
    if (!conv || !text.trim()) return
    setSending(true)
    try {
      if (live) { await call({ conversationId: conv.id, text }); update(d => { const c = d.waConversations.find(x => x.id === conv.id); if (c) c.needsHuman = true }) }
      else update(d => { d.waMessages.push({ id: uid(), storeId: d.store.id, conversationId: conv.id, direction: 'out', body: text, at: new Date().toISOString() }); const c = d.waConversations.find(x => x.id === conv.id); if (c) { c.lastMessageAt = new Date().toISOString(); c.needsHuman = true } })
      setText('')
    } catch (e) { toast(`Couldn’t send: ${(e as Error).message}`) } finally { setSending(false) }
  }
  const handBack = async () => {
    if (!conv) return
    try { if (live) await call({ conversationId: conv.id, handBack: true }); update(d => { const c = d.waConversations.find(x => x.id === conv.id); if (c) { c.needsHuman = false; c.state = {} } }); toast('The bot will handle new messages again') } catch (e) { toast((e as Error).message) }
  }

  if (!data.waConversations.length) return <Empty title="No WhatsApp chats yet" icon={<MessageCircle />}>Once your number is connected, chats appear here.</Empty>
  return (
    <div className="inbox">
      <div className="inbox-list">
        {data.waConversations.map(c => {
          const last = data.waMessages.filter(m => m.conversationId === c.id).at(-1)
          return (
            <button key={c.id} className={cx('inbox-item', c.id === sel && 'on')} onClick={() => setSel(c.id)}>
              <div className="avatar sm">{(c.name || c.phone).slice(0, 2).toUpperCase()}</div>
              <div className="grow" style={{ minWidth: 0 }}><div className="row between"><b>{c.name || '+' + c.phone}</b><span className="xs muted">{ago(c.lastMessageAt)}</span></div>
                <div className="xs muted ellipsis">{last?.body}</div>{c.needsHuman && <Badge tone="warn" plain>Needs a reply</Badge>}</div>
            </button>
          )
        })}
      </div>
      {conv ? (
        <div className="chat">
          <div className="chat-head"><div className="grow"><b>{conv.name || 'Customer'}</b><div className="xs muted">+{conv.phone}</div></div>
            {conv.needsHuman ? <button className="btn sm" onClick={handBack}><Bot />Hand back to bot</button> : <Badge tone="good">Bot is replying</Badge>}</div>
          <div className="chat-body">
            {msgs.map(m => <div key={m.id} className={cx('bubble', m.direction)}>{m.body.split('\n').map((l, i) => <div key={i}>{l || ' '}</div>)}<span className="xs">{fTime(m.at)}</span></div>)}
            <div ref={end} />
          </div>
          <div className="chat-input">
            <input type="text" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && reply()} placeholder="Type a reply… (the bot pauses while you chat)" aria-label="Reply" />
            <button className="btn primary" disabled={sending || !text.trim()} onClick={reply}><Send />Send</button>
          </div>
        </div>
      ) : <Empty title="Pick a chat" icon={<UserRound />} />}
    </div>
  )
}

function Setup() {
  const { data, update, api, live } = useData()
  const toast = useToast()
  const [w, setW] = useState<NonNullable<StoreSettings['whatsapp']>>({ enabled: false, phoneNumberId: '', displayNumber: '', mode: 'chat', greeting: '', ...(data.store.settings.whatsapp ?? {}) })
  const [token, setToken] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [verify] = useState(() => data.store.settings.whatsapp?.verifyToken || Math.random().toString(36).slice(2, 12))
  const webhook = `${import.meta.env.VITE_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co'}/functions/v1/whatsapp/${data.store.id}`
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast('Copied') } catch { toast(t) } }
  const save = async () => {
    try {
      update(d => { d.store.settings = { ...d.store.settings, whatsapp: { ...w, verifyToken: verify } } })
      if (live) {
        if (token.trim()) await api.setSecret('whatsapp_token', token.trim())
        if (appSecret.trim()) await api.setSecret('whatsapp_app_secret', appSecret.trim())
        await api.setSecret('whatsapp_verify_token', verify)
      }
      setToken(''); setAppSecret(''); toast('WhatsApp settings saved')
    } catch (e) { toast(`Couldn’t save: ${(e as Error).message}`) }
  }
  return (
    <div className="card-body">
      <div className="row between"><div><b>Answer WhatsApp orders automatically</b><p className="small muted">Turn off to stop the bot. Messages still arrive in the inbox.</p></div><Switch label="Bot on" checked={w.enabled} onChange={v => setW({ ...w, enabled: v })} /></div>
      <div className="radio-cards">
        {([['chat', 'Order in the chat', 'Customers reply with item numbers. Best for people who don’t use websites.'], ['link', 'Send a link', 'The bot replies with your website link. Uses fewer messages, so it costs less.']] as const).map(([k, t, d]) => (
          <label key={k} className={cx('radio-card', w.mode === k && 'on')}><input type="radio" checked={w.mode === k} onChange={() => setW({ ...w, mode: k })} /><span><b>{t}</b><small>{d}</small></span></label>
        ))}
      </div>
      <Field label="Greeting" htmlFor="wg"><input id="wg" type="text" value={w.greeting} onChange={e => setW({ ...w, greeting: e.target.value })} placeholder={`Welcome to ${data.store.name}! 👋`} /></Field>
      <div className="divider" />
      <h3>Connect the business number</h3>
      <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
        <li>Go to <b>developers.facebook.com</b>, create an app of type <b>Business</b>, and add the <b>WhatsApp</b> product.</li>
        <li>Under WhatsApp → API Setup, add the client’s phone number (it can’t be in use on the normal WhatsApp app).</li>
        <li>Copy the <b>Phone number ID</b> and a <b>permanent access token</b> (Business settings → System users) into the boxes below.</li>
        <li>Under WhatsApp → Configuration, set the webhook URL and verify token shown below, then subscribe to <b>messages</b>.</li>
      </ol>
      <div className="grid2">
        <Field label="Phone number ID" htmlFor="wp"><input id="wp" type="text" className="mono" value={w.phoneNumberId} onChange={e => setW({ ...w, phoneNumberId: e.target.value.trim() })} /></Field>
        <Field label="Number customers see" htmlFor="wd"><input id="wd" type="tel" value={w.displayNumber} onChange={e => setW({ ...w, displayNumber: e.target.value })} placeholder="+233 24 000 0000" /></Field>
      </div>
      <Field label="Access token" hint="Stored on the server only." htmlFor="wt"><input id="wt" type="password" className="mono" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste to save or replace" /></Field>
      <Field label="App secret (optional, recommended)" hint="Lets the server check messages really come from Meta." htmlFor="wa"><input id="wa" type="password" className="mono" autoComplete="off" value={appSecret} onChange={e => setAppSecret(e.target.value)} /></Field>
      <Field label="Webhook URL"><div className="row"><input type="text" readOnly className="mono" value={webhook} aria-label="Webhook URL" /><button className="btn" onClick={() => copy(webhook)}><Copy />Copy</button></div></Field>
      <Field label="Verify token" hint="Saved when you press Save. Use the same value in Meta."><div className="row"><input type="text" readOnly className="mono" value={verify} aria-label="Verify token" /><button className="btn" onClick={() => copy(verify)}><Copy />Copy</button></div></Field>
      <div><button className="btn primary" onClick={save}>Save</button></div>
    </div>
  )
}
