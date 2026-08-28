import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDown, Ban, Check, Download, ImagePlus, MessageCircle, MoreVertical, Pencil, Reply, Search, Send, Smile, Trash2, Unlock, X } from 'lucide-react'
import { storeService, type ChatMessage, type Conversation } from '../api/services/store'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'
import { cn } from '../lib/cn'

const CONV_POLL_MS = 5000
const MSG_POLL_MS = 3000
const EMOJIS = ['😀', '😂', '❤️', '👍', '🔥', '🎉', '😮', '😢', '🙌', '😍', '🤝', '👀']

function parseDate(sqlDate: string | null): Date {
  if (!sqlDate) return new Date(NaN)
  const d = new Date(sqlDate.includes('T') ? sqlDate : `${sqlDate.replace(' ', 'T')}Z`)
  return Number.isNaN(d.getTime()) ? new Date(NaN) : d
}
function formatTime(sqlDate: string | null): string {
  const d = parseDate(sqlDate)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function dayKey(date: Date): string {
  if (Number.isNaN(date.getTime())) return '?'
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function formatDay(sqlDate: string | null): string {
  const d = parseDate(sqlDate)
  if (Number.isNaN(d.getTime())) return ''
  const today = dayKey(new Date())
  const yest = dayKey(new Date(Date.now() - 86400000))
  const k = dayKey(d)
  if (k === today) return 'Hoy'
  if (k === yest) return 'Ayer'
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

export function Chat() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const requested = params.get('user')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(requested ? Number(requested) : null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')

  const pickImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { setError('Imagen demasiado grande (máx. 3 MB)'); return }
    const reader = new FileReader()
    reader.onload = () => { setImageUrl(String(reader.result)); setError(''); setEditing(null) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await storeService.getConversations()
        if (cancelled) return
        let items = res.items
        if (requested && !items.some((c) => c.userId === Number(requested))) {
          try {
            const p = await storeService.getUserProfile(Number(requested))
            items = [{ userId: p.id, name: p.name, role: p.role, country: p.country, lastMessage: null, lastAt: null, unreadCount: 0 }, ...items]
          } catch { /* usuario inexistente */ }
        }
        setConversations(items)
        setError('')
      } catch { setError(t('chat.error')) }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [user, requested, t])

  useEffect(() => {
    if (!user) return
    const id = window.setInterval(() => { storeService.getConversations().then((res) => setConversations(res.items)).catch(() => undefined) }, CONV_POLL_MS)
    return () => window.clearInterval(id)
  }, [user])

  useEffect(() => {
    if (!user || selectedId == null) return
    let cancelled = false
    const load = async () => {
      try {
        const res = await storeService.getMessages(selectedId)
        if (!cancelled) { setMessages(res.items); setError('') }
      } catch { if (!cancelled) setError(t('chat.error')) }
    }
    void load()
    const id = window.setInterval(() => void load(), MSG_POLL_MS)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [user, selectedId, t])

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    setShowScrollBtn(false)
  }
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    setShowScrollBtn(false)
  }, [messages.length, selectedId])

  const openConversation = (id: number) => {
    setSelectedId(id)
    setParams({ user: String(id) }, { replace: true })
    setMenuOpen(false)
    setEmojiOpen(false)
  }

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if ((!content && !imageUrl.trim()) || selectedId == null || sending || blocked) return
    setSending(true)
    try {
      let final = content
      if (replyTo && content) {
        const quoted = (replyTo.content ? replyTo.content.split('\n')[0].slice(0, 80) : '📷 Foto').trim()
        final = `↩ ${quoted}\n${content}`
      }
      const msg = await storeService.sendMessage(selectedId, final, imageUrl.trim() || undefined)
      setMessages((prev) => [...prev, msg])
      setText('')
      setImageUrl('')
      setReplyTo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('chat.error'))
    } finally { setSending(false) }
  }

  const editMessage = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing || !text.trim()) return
    try {
      const updated = await storeService.editMessage(editing.id, text.trim())
      setMessages((prev) => prev.map((m) => m.id === updated.id ? updated : m))
      setEditing(null)
      setText('')
    } catch { setError(t('chat.error')) }
  }

  const removeMessage = async (id: number) => {
    try {
      await storeService.deleteMessage(id)
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, content: '', imageUrl: null, deletedAt: new Date().toISOString() } : m))
    } catch { setError(t('chat.error')) }
  }

  const toggleBlock = async () => {
    if (selectedId == null) return
    try {
      if (blocked) await storeService.unblockUser(selectedId); else await storeService.blockUser(selectedId)
      setBlocked(!blocked)
      setMenuOpen(false)
    } catch { setError(t('chat.error')) }
  }

  const removeContact = async () => {
    if (selectedId == null) return
    try {
      await storeService.removeContact(selectedId)
      setConversations((prev) => prev.filter((c) => c.userId !== selectedId))
      setSelectedId(null)
      setMessages([])
      setMenuOpen(false)
    } catch { setError(t('chat.error')) }
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50"><MessageCircle className="h-8 w-8 text-brand-600" /></div>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">{t('chat.loginNeeded')}</h1>
        <p className="mt-2 text-slate-500">{t('chat.loginNeededSub')}</p>
        <Link to="/login" className="mt-6 rounded-xl bg-brand-600 px-6 py-3 font-bold text-white hover:bg-brand-700">{t('chat.signIn')}</Link>
      </div>
    )
  }

  const selected = conversations.find((c) => c.userId === selectedId) ?? null
  const supportChat = user.role === 'support' || selected?.role === 'support'
  const isSupportAgent = user.role === 'support'
  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0)
  const supportReplies = ['Hola, soy del equipo de soporte. ¿En qué puedo ayudarte?', 'Voy a revisar tu caso y te responderé en breve.', '¿Puedes enviarme el número de pedido o código de producto?', 'He recibido la información. Gracias por compartirla.']

  // Filtro de búsqueda dentro de la conversación abierta.
  const q = search.trim().toLowerCase()
  const filtered = q ? messages.filter((m) => (m.content ?? '').toLowerCase().includes(q)) : messages
  // Inserta separadores de fecha entre mensajes consecutivos de días distintos.
  const body: (string | ChatMessage)[] = []
  let lastKey: string | null = null
  for (const m of filtered) {
    const k = dayKey(parseDate(m.createdAt))
    if (k !== lastKey) { body.push(k); lastKey = k }
    body.push(m)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{t('chat.title')}</h1>
        {totalUnread > 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 text-xs font-bold text-white">{totalUnread} sin leer</span>}
      </div>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_1fr]">
        {/* Lista de conversaciones */}
        <aside className={cn('border-slate-200 lg:border-r', selected ? 'hidden lg:block' : 'block')}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold uppercase tracking-wide text-slate-500">Conversaciones</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{conversations.length}</span>
          </div>
          <div className="h-[calc(100vh-300px)] min-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="space-y-3 p-4">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />)}</div>
            ) : conversations.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <MessageCircle className="h-10 w-10 text-slate-200" />
                <p className="mt-3 text-sm text-slate-500">{t('chat.noConv')}</p>
                <p className="mt-1 text-xs text-slate-400">Sigue a un vendedor para poder chatear.</p>
              </div>
            ) : (
              <ul className="p-2">
                {conversations.map((c) => (
                  <li key={c.userId}>
                    <button onClick={() => openConversation(c.userId)} className={cn('flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors', selectedId === c.userId ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
                        {c.name.charAt(0).toUpperCase()}
                        {c.unreadCount > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1">
                            <span className="truncate font-bold text-slate-900">{c.name}</span>
                            {c.verified && (
                              <span title="Usuario verificado" aria-label="Usuario verificado" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[9px] font-black leading-none text-white">✓</span>
                            )}
                          </span>
                          {c.lastAt && <span className="text-[11px] text-slate-400">{formatTime(c.lastAt)}</span>}
                        </span>
                        <span className="mt-0.5 flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-slate-500">{c.lastMessage ?? t('chat.empty')}</span>
                          {c.unreadCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{c.unreadCount}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Panel de conversación */}
        <section className={cn('relative flex flex-col bg-slate-50/60', !selected && 'hidden lg:flex')}>
          {!selected ? (
            <div className="flex h-[calc(100vh-300px)] min-h-[420px] flex-col items-center justify-center text-slate-400">
              <MessageCircle className="h-12 w-12 text-slate-200" />
              <p className="mt-3">{t('chat.select')}</p>
            </div>
          ) : (
            <>
              {/* Cabecera */}
              <header className={cn('flex items-center gap-3 border-b border-slate-100 px-5 py-3', supportChat ? 'bg-slate-900 text-white' : 'bg-white')}>
                <span className={cn('flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold', supportChat ? 'bg-brand-500 text-white' : 'bg-gradient-to-br from-brand-500 to-brand-700 text-white')}>{selected.name.charAt(0).toUpperCase()}</span>
                <div className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <Link to={`/vendedor/${selected.userId}`} className={cn('truncate font-bold hover:text-brand-300', supportChat ? 'text-white' : 'text-slate-900 hover:text-brand-700')}>{selected.name}</Link>
                    {selected.verified && (
                      <span title="Usuario verificado" aria-label="Usuario verificado" className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-400 text-[9px] font-black leading-none text-white">✓</span>
                    )}
                  </span>
                  <p className={cn('text-xs', supportChat ? 'text-slate-300' : 'text-slate-400')}>{selected.role === 'support' ? 'Soporte oficial · Centro de ayuda' : (selected.country || 'Usuario')}{blocked && <span className="ml-2 font-semibold text-red-500">· Bloqueado</span>}</p>
                </div>
                {selected.role !== 'support' && !isSupportAgent && <div className="relative ml-auto">
                  <button onClick={() => setMenuOpen(!menuOpen)} aria-label="Opciones de contacto" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-5 w-5" /></button>
                  {menuOpen && (
                    <div className="absolute right-0 top-11 z-10 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                      <button onClick={() => void toggleBlock()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
                        {blocked ? <Unlock className="h-4 w-4" /> : <Ban className="h-4 w-4" />} {blocked ? 'Desbloquear cuenta' : 'Bloquear cuenta'}
                      </button>
                      <button onClick={() => void removeContact()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                        <Trash2 className="h-4 w-4" /> Borrar contacto
                      </button>
                    </div>
                  )}
                </div>}
              </header>

              {/* Buscar en la conversación */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-2">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar en la conversación…"
                  className="h-8 w-full flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-brand-400 focus:bg-white"
                />
                {search && (
                  <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="rounded p-1 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                )}
              </div>
              {q && (
                <p className="border-b border-slate-100 bg-brand-50/40 px-4 py-1.5 text-[11px] text-brand-700">
                  {filtered.length} resultado{filtered.length !== 1 && 's'} para “{search}”
                </p>
              )}

              {/* Mensajes */}
              <div
                ref={scrollRef}
                onScroll={() => {
                  const el = scrollRef.current
                  if (!el) return
                  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
                  setShowScrollBtn(!nearBottom)
                }}
                className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.06),transparent_50%)] p-5"
                style={{ height: q ? 'calc(100vh - 460px)' : 'calc(100vh - 400px)', minHeight: 360 }}
              >
                {body.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">{t('chat.empty')}</div>
                ) : (
                  <div className="space-y-1">
                    {body.map((item, idx) => {
                      if (typeof item === 'string') {
                        return <div key={`sep-${item}-${idx}`} className="my-3 flex items-center justify-center"><span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-400 shadow-sm">{formatDay(item)}</span></div>
                      }
                      const m = item
                      const mine = m.senderId === user.id
                      const deleted = Boolean(m.deletedAt)
                      return (
                        <div key={m.id} className={cn('group flex', mine ? 'justify-end' : 'justify-start')}>
                          <div className={cn('relative max-w-[78%] px-4 py-2.5 text-sm shadow-sm transition-shadow hover:shadow-md', mine ? 'rounded-2xl rounded-br-md bg-gradient-to-br from-brand-500 to-brand-700 text-white' : 'rounded-2xl rounded-bl-md bg-white text-slate-700')}>
                            <div className="absolute -top-3 z-10 hidden gap-1 rounded-lg bg-white p-1 shadow group-hover:flex">
                              <button onClick={() => { setReplyTo(m); setEditing(null) }} disabled={deleted} aria-label="Responder" className="rounded p-0.5 text-slate-500 hover:text-brand-600"><Reply className="h-3.5 w-3.5" /></button>
                              <button onClick={() => { setEditing(m); setText(m.content); setEmojiOpen(false) }} disabled={deleted || !mine} aria-label="Editar mensaje" className="rounded p-0.5 text-slate-500 hover:text-brand-600"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => void removeMessage(m.id)} disabled={deleted || !mine} aria-label="Borrar mensaje" className="rounded p-0.5 text-slate-500 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                            {deleted ? (
                              <p className="italic opacity-60">Mensaje eliminado</p>
                            ) : (
                              <>
                                {m.imageUrl && (
                                  <a href={m.imageUrl} target="_blank" rel="noreferrer" className="group/img relative mb-2 block overflow-hidden rounded-lg">
                                    <img src={m.imageUrl} alt="Imagen del mensaje" className="max-h-56 w-full object-cover" />
                                    <span className="absolute inset-0 hidden items-center justify-center bg-slate-950/40 group-hover/img:flex"><Download className="h-5 w-5 text-white" /></span>
                                  </a>
                                )}
                                {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                              </>
                            )}
                            <p className={cn('mt-1 flex items-center gap-1 text-[10px]', mine ? 'text-brand-100' : 'text-slate-400')}>
                              {formatTime(m.createdAt)}{m.editedAt && ' · editado'}
                              {!deleted && mine && (
                                <span className="inline-flex items-center text-[9px]">
                                  {m.isRead ? <><Check className="h-3 w-3" /><Check className="-ml-1.5 h-3 w-3" /></> : <Check className="h-3 w-3" />}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {showScrollBtn && (
                <button
                  type="button"
                  onClick={() => scrollToBottom()}
                  aria-label="Ir al último mensaje"
                  className="absolute bottom-20 right-24 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-lg transition-transform hover:scale-105 hover:text-brand-600 animate-fade-up"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              )}

              {/* Compositor */}
              <form onSubmit={editing ? editMessage : send} className="border-t border-slate-100 bg-white p-4">
                {isSupportAgent && !editing && (
                  <div className="mb-3 flex flex-wrap gap-1.5 rounded-xl bg-slate-50 p-2">
                    {supportReplies.map((reply) => <button key={reply} type="button" onClick={() => setText(reply)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">{reply}</button>)}
                  </div>
                )}
                {replyTo && !editing && (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-brand-500 bg-brand-50/60 px-3 py-2">
                    <Reply className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                    <p className="min-w-0 flex-1 truncate text-[11px] text-slate-600">
                      <span className="font-bold">Respondiendo:</span> {replyTo.content ? replyTo.content.split('\n')[0] : '📷 Foto'}
                    </p>
                    <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar respuesta" className="rounded p-0.5 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  {editing && (
                    <button type="button" onClick={() => { setEditing(null); setText('') }} aria-label="Cancelar edición" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
                  )}
                  <div className="relative flex-1">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement)?.requestSubmit() } }}
                      placeholder={editing ? 'Editar mensaje…' : t('chat.placeholder')}
                      disabled={blocked}
                      rows={text.includes('\n') ? 2 : 1}
                      className="h-8 max-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm outline-none transition-colors focus:border-brand-400 focus:bg-white"
                    />
                    {imageUrl && (
                      <span className="absolute -top-2 right-6 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                        📷 imagen <button type="button" onClick={() => setImageUrl('')} aria-label="Quitar imagen"><X className="h-3 w-3" /></button>
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={() => setEmojiOpen(!emojiOpen)} aria-label="Emojis" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><Smile className="h-5 w-5" /></button>
                  <button type="button" onClick={() => fileRef.current?.click()} aria-label="Adjuntar imagen" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-brand-50 hover:text-brand-600"><ImagePlus className="h-5 w-5" /></button>
                  <button type="submit" disabled={(!text.trim() && !imageUrl.trim()) || sending || blocked} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition-transform hover:bg-brand-700 disabled:opacity-40">
                    <Send className="h-5 w-5" />
                  </button>
                </div>
                {emojiOpen && (
                  <div className="mt-2 flex flex-wrap gap-1 rounded-2xl border border-slate-100 bg-slate-50 p-2">
                    {EMOJIS.map((e) => (
                      <button key={e} type="button" onClick={() => { setText((cur) => cur + e); setEmojiOpen(false) }} className="rounded-lg p-1 text-xl transition-transform hover:scale-125">{e}</button>
                    ))}
                  </div>
                )}
                {!editing && (
                  <p className="mt-1.5 text-center text-[10px] text-slate-300">Enter para enviar · Shift+Enter para salto de línea</p>
                )}
                <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} className="hidden" />
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}