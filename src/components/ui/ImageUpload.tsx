import { useRef, useState, type ChangeEvent } from 'react'
import { Camera, ImagePlus, Link, X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { CameraCapture } from './CameraCapture'

/**
 * Subida de imagen con tres caminos: galería / cámara / explorador de archivos.
 * La imagen se reduce y comprime a un data URL (base64) para guardarla sin servidor externo.
 * También permite pegar una URL.
 */
export function ImageUpload({
  value,
  onChange,
  placeholder = 'https://… o sube una imagen',
  hideUrl = false,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hideUrl?: boolean
  className?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/image\//.test(file.type)) { setError('Selecciona un archivo de imagen'); return }
    if (file.size > 6 * 1024 * 1024) { setError('La imagen pesa más de 6 MB'); return }
    try {
      const dataUrl = await readAsCompressedDataUrl(file)
      onChange(dataUrl)
      setError('')
    } catch {
      setError('No se pudo procesar la imagen')
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      {!hideUrl && (
        <div className="relative">
          <Link className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={value.startsWith('data:') ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 pl-9 text-sm outline-none focus:border-brand-400 focus:bg-white"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-100"
        >
          <ImagePlus className="h-4 w-4" /> Subir imagen
        </button>
        <button
          type="button"
          onClick={() => { setCameraOpen(true); setError('') }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-50"
        >
          <Camera className="h-4 w-4" /> Usar cámara en tiempo real
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={pick} className="hidden" />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {cameraOpen && (
        <CameraCapture
          mode="photo"
          onCapture={(dataUrl) => { onChange(dataUrl); setCameraOpen(false); setError('') }}
          onClose={() => setCameraOpen(false)}
        />
      )}
      {value && value.startsWith('data:') && (
        <div className="relative inline-block">
          <img src={value} alt="Vista previa" className="max-h-32 rounded-xl border border-slate-200 object-cover" />
          <button type="button" onClick={() => onChange('')} aria-label="Quitar imagen" className="absolute -right-2 -top-2 rounded-full bg-slate-900 p-1 text-white shadow">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}

/** Lee un archivo de imagen y devuelve un data URL comprimido (máx. 900px, JPEG ~0.82). */
async function readAsCompressedDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read'))
    r.readAsDataURL(file)
  })
  if (!/data:image\/(png|jpe?g|webp)/i.test(dataUrl)) return dataUrl
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('img'))
    i.src = dataUrl
  })
  const max = 900
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.82)
}

export default ImageUpload