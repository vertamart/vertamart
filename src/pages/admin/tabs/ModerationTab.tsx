import { useState } from 'react'
import { MessageSquare, ShieldAlert, Trash2, Video } from 'lucide-react'
import { storeService, type ModerationMessage, type ModerationPost } from '../../../api/services/store'
import { useAdmin } from '../context'
import { ConfirmModal, EmptyState, Skeleton } from '../ui'

export function ModerationTab() {
  const { notify } = useAdmin()
  const [posts, setPosts] = useState<ModerationPost[] | null>(null)
  const [messages, setMessages] = useState<ModerationMessage[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'post' | 'message'; id: number; label: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [feed, msgs] = await Promise.all([storeService.adminListFeedPosts(), storeService.adminListMessages()])
      setPosts(feed.items)
      setMessages(msgs.items)
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo cargar la moderación', 'info') } finally { setLoading(false) }
  }

  useState(() => { void load() })

  const doDelete = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.kind === 'post') {
        await storeService.adminDeleteFeedPost(confirm.id)
        setPosts((cur) => (cur ? cur.filter((p) => p.id !== confirm.id) : cur))
        notify('Publicación del feed eliminada', 'info')
      } else {
        await storeService.adminDeleteMessage(confirm.id)
        setMessages((cur) => (cur ? cur.filter((m) => m.id !== confirm.id) : cur))
        notify('Mensaje moderado', 'info')
      }
    } catch (err) { notify(err instanceof Error ? err.message : 'No se pudo eliminar', 'info') } finally { setBusy(false); setConfirm(null) }
  }

  if (loading && !posts) return <Skeleton rows={5} />

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <ShieldAlert className="h-5 w-5 text-amber-700" />
        <p className="text-sm text-amber-800">Revisa el contenido de la comunidad. El borrado es lógico y conserva la trazabilidad.</p>
      </div>

      {/* Feed */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Video className="h-5 w-5 text-amber-700" />
          <div>
            <h2 className="font-bold text-slate-900">Publicaciones del feed</h2>
            <p className="text-sm text-slate-500">Elimina contenido que incumpla las normas.</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {!posts ? null : posts.length === 0 ? (
            <EmptyState title="Sin publicaciones" subtitle="No hay publicaciones de usuarios para revisar." />
          ) : posts.map((post) => (
            <div key={post.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 transition-colors hover:bg-slate-100/70">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-800">{post.title}</p>
                <p className="text-xs text-slate-500">{post.userName} · {post.commentsCount} comentarios · {new Date(post.createdAt).toLocaleString('es-ES')}</p>
              </div>
              <button onClick={() => setConfirm({ kind: 'post', id: post.id, label: post.title })} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Mensajes */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 text-brand-600" />
          <div>
            <h2 className="font-bold text-slate-900">Mensajes recientes</h2>
            <p className="text-sm text-slate-500">El borrado es lógico y conserva la trazabilidad.</p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {!messages ? null : messages.length === 0 ? (
            <EmptyState title="Sin mensajes" subtitle="No hay mensajes para revisar." />
          ) : messages.map((message) => (
            <div key={message.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 transition-colors hover:bg-slate-100/70">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-700">{message.senderName} → {message.receiverName}</p>
                <p className="truncate text-sm text-slate-600">{message.content || 'Imagen adjunta'}</p>
                <p className="text-[11px] text-slate-400">{new Date(message.createdAt).toLocaleString('es-ES')}</p>
              </div>
              <button onClick={() => setConfirm({ kind: 'message', id: message.id, label: 'este mensaje' })} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> Borrar
              </button>
            </div>
          ))}
        </div>
      </section>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => void doDelete()}
        loading={busy}
        title="¿Eliminar contenido?"
        message={<span>Se eliminará <strong>{confirm?.label}</strong> de la comunidad. Esta acción no se puede deshacer.</span>}
      />
    </div>
  )
}
