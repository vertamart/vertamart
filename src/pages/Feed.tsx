import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Heart, MessageCircle, Send, Share2, Trash2, Video, X } from 'lucide-react'
import { storeService, type FeedComment, type FeedPost } from '../api/services/store'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { cn } from '../lib/cn'
import { CameraCapture } from '../components/ui/CameraCapture'

// Respaldo sin datos inventados: likes y comentarios empiezan en cero (solo reales).
const DEMO_POSTS: FeedPost[] = [
  { id: -1, userId: 0, userName: 'Vertamart', productId: null, productCode: null, productName: null, title: 'Descubre nuestro catálogo', description: 'Nuevas tecnologías para tu setup y tu día a día.', videoUrl: 'https://videos.pexels.com/video-files/3195394/3195394-hd_1920_1080_25fps.mp4', likesCount: 0, liked: false, commentsCount: 0, createdAt: new Date().toISOString() },
  { id: -2, userId: 0, userName: 'Vertamart', productId: null, productCode: null, productName: null, title: 'Audio para todos tus viajes', description: 'Sonido limpio, batería larga y cancelación de ruido.', videoUrl: 'https://videos.pexels.com/video-files/853800/853800-hd_1920_1080_25fps.mp4', likesCount: 0, liked: false, commentsCount: 0, createdAt: new Date().toISOString() },
]

export function Feed() {
  const { user } = useAuth()
  const { notify } = useStore()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [productCode, setProductCode] = useState('')
  const [comments, setComments] = useState<Record<number, FeedComment[]>>({})
  const [commentText, setCommentText] = useState<Record<number, string>>({})
  const [activeComments, setActiveComments] = useState<number | null>(null)
  const [shareId, setShareId] = useState<number | null>(null)
  const [following, setFollowing] = useState<{ id: number; name: string }[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await storeService.getFeed()
      setPosts(res.items.length ? res.items : DEMO_POSTS)
      if (user) setFollowing((await storeService.getFollowing()).items)
    } catch {
      setPosts(DEMO_POSTS)
    } finally {
      setLoading(false)
    }
  }, [user])
  useEffect(() => { void load() }, [load])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const post = await storeService.createFeedPost({ title, description, videoUrl: videoUrl || undefined, productCode: productCode || undefined })
      setPosts((p) => [post, ...p])
      setTitle('')
      setDescription('')
      setVideoUrl('')
      setProductCode('')
      setShowForm(false)
      notify('Promoción publicada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar')
    }
  }

  const like = async (post: FeedPost) => {
    if (post.id < 0 || !user) return
    try {
      const result = await storeService.likeFeedPost(post.id)
      setPosts((p) => p.map((x) => x.id === post.id ? { ...x, liked: result.liked, likesCount: result.likesCount } : x))
    } catch {
      notify('Inicia sesión para dar like', 'info')
    }
  }

  const showComments = async (id: number) => {
    setActiveComments(activeComments === id ? null : id)
    if (!comments[id] && id > 0) {
      try {
        const result = await storeService.getFeedComments(id)
        setComments((c) => ({ ...c, [id]: result.items }))
      } catch { /* noop */ }
    }
  }

  const addComment = async (id: number) => {
    const text = (commentText[id] ?? '').trim()
    if (!text || !user || id < 0) return
    try {
      const item = await storeService.addFeedComment(id, text)
      setComments((c) => ({ ...c, [id]: [...(c[id] ?? []), item] }))
      setCommentText((c) => ({ ...c, [id]: '' }))
      setPosts((p) => p.map((x) => x.id === id ? { ...x, commentsCount: x.commentsCount + 1 } : x))
    } catch {
      notify('Inicia sesión para comentar', 'info')
    }
  }

  const removeComment = async (postId: number, commentId: string) => {
    try {
      await storeService.deleteFeedComment(commentId)
      setComments((c) => ({ ...c, [postId]: (c[postId] ?? []).filter((x) => x.id !== commentId) }))
      setPosts((p) => p.map((x) => x.id === postId ? { ...x, commentsCount: Math.max(0, x.commentsCount - 1) } : x))
    } catch {
      notify('No se pudo borrar el comentario', 'info')
    }
  }

  const share = async (post: FeedPost, receiverId: number) => {
    if (post.id < 0) return
    try {
      await storeService.shareFeedPost(post.id, receiverId)
      setShareId(null)
      notify('Video compartido por mensajes')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo compartir', 'info')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">Comunidad</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Descubre productos</h1>
          <p className="mt-2 text-slate-500">Promociones y videos de nuestra comunidad.</p>
        </div>
        {user && (
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Video className="h-4 w-4" /> Publicar video
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={create} className="mt-6 space-y-3 rounded-2xl border border-brand-200 bg-brand-50/40 p-5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} placeholder="Título" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={3} placeholder="Descripción" rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          <input value={productCode} onChange={(e) => setProductCode(e.target.value.toUpperCase())} placeholder="Código de producto (opcional, ej. VT-AB12CD34)" className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm" />
          <div className="flex flex-wrap gap-2">
            <input value={videoUrl.startsWith('data:') ? '' : videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="URL del vídeo https://… (opcional)" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
            <button type="button" onClick={() => { setCameraOpen(true); setError('') }} className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-3 text-sm font-bold text-brand-700 hover:bg-brand-50">
              <Camera className="h-4 w-4" /> Grabar con cámara
            </button>
          </div>
          {cameraOpen && (
            <CameraCapture
              mode="video"
              onCapture={(dataUrl) => { setVideoUrl(dataUrl); setCameraOpen(false); setError('') }}
              onClose={() => setCameraOpen(false)}
            />
          )}
          {videoUrl.startsWith('data:') && (
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-2">
              <video src={videoUrl} controls className="max-h-64 w-full rounded-lg object-contain" />
              <button type="button" onClick={() => setVideoUrl('')} aria-label="Quitar vídeo grabado" className="absolute right-4 top-4 rounded-full bg-slate-950/80 p-1.5 text-white hover:bg-red-600"><X className="h-4 w-4" /></button>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="rounded-xl bg-brand-600 px-5 py-2.5 font-bold text-white hover:bg-brand-700">Publicar</button>
        </form>
      )}

      {loading ? (
        <div className="mt-8 space-y-6">
          {[1, 2].map((x) => <div key={x} className="h-96 animate-pulse rounded-3xl bg-slate-100" />)}
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {posts.map((post) => (
            <article key={post.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 p-5">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 font-bold text-white">{post.userName.charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-bold text-slate-900">{post.userName}{post.userVerified && <span title="Usuario verificado" aria-label="Usuario verificado" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-black text-white">✓</span>}</p>
                  {post.productCode && <Link to={`/productos?codigo=${post.productCode}`} className="text-xs font-semibold text-brand-700 hover:underline">{post.productName ?? post.productCode}</Link>}
                </div>
              </div>
              <video src={post.videoUrl} controls preload="metadata" className="aspect-video w-full bg-slate-950 object-cover" />
              <div className="p-5">
                <h2 className="text-xl font-extrabold text-slate-900">{post.title}</h2>
                <p className="mt-2 text-slate-600">{post.description}</p>
                <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4">
                  <button onClick={() => void like(post)} className={cn('inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold', post.liked ? 'bg-red-50 text-red-500' : 'text-slate-500 hover:bg-slate-50')}>
                    <Heart className={cn('h-4 w-4', post.liked && 'fill-current')} /> {post.likesCount}
                  </button>
                  <button onClick={() => void showComments(post.id)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                    <MessageCircle className="h-4 w-4" /> {post.commentsCount}
                  </button>
                  {user && post.id > 0 && (
                    <button onClick={() => setShareId(shareId === post.id ? null : post.id)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
                      <Share2 className="h-4 w-4" /> Compartir
                    </button>
                  )}
                </div>
                {shareId === post.id && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-bold uppercase text-slate-500">Enviar a</p>
                    {following.length ? (
                      following.map((f) => <button key={f.id} onClick={() => void share(post, f.id)} className="mr-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-brand-50">{f.name}</button>)
                    ) : (
                      <p className="text-sm text-slate-500">Sigue a un usuario para compartirle videos.</p>
                    )}
                  </div>
                )}
                {activeComments === post.id && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    {(comments[post.id] ?? []).map((c) => (
                      <div key={c.id} className="group flex items-start justify-between gap-2">
                        <p className="text-sm"><strong>{c.userName}:</strong> {c.content}</p>
                        {user && c.userId === user.id && (
                          <button onClick={() => void removeComment(post.id, c.id)} aria-label="Eliminar comentario" className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {user && post.id > 0 && (
                      <div className="flex gap-2">
                        <input value={commentText[post.id] ?? ''} onChange={(e) => setCommentText((c) => ({ ...c, [post.id]: e.target.value }))} placeholder="Escribe un comentario" className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" />
                        <button onClick={() => void addComment(post.id)} className="rounded-lg bg-brand-600 px-3 text-white"><Send className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}