import { useEffect, useRef, useState } from 'react'
import { Camera, CircleStop, LoaderCircle, Play, Square, X } from 'lucide-react'
import { cn } from '../../lib/cn'

type CameraMode = 'photo' | 'video'

export function CameraCapture({
  mode,
  onCapture,
  onClose,
  className,
}: {
  mode: CameraMode
  onCapture: (dataUrl: string) => void
  onClose: () => void
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Tu navegador no permite usar la cámara. Prueba con HTTPS o localhost.')
        setStarting(false)
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: mode === 'video',
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (cause) {
        const name = cause instanceof DOMException ? cause.name : ''
        setError(name === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en los permisos del navegador.' : 'No se pudo abrir la cámara. Comprueba que no esté siendo usada por otra aplicación.')
      } finally {
        if (!cancelled) setStarting(false)
      }
    }
    void start()
    return () => {
      cancelled = true
      recorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [mode])

  const close = () => {
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    onClose()
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return
    const max = 1280
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    onCapture(canvas.toDataURL('image/jpeg', 0.84))
    close()
  }

  const startRecording = () => {
    const stream = streamRef.current
    if (!stream || !('MediaRecorder' in window)) {
      setError('Este navegador no permite grabar vídeo.')
      return
    }
    const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type))
    if (!mimeType) {
      setError('El formato de vídeo de este navegador no es compatible.')
      return
    }
    chunksRef.current = []
    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      if (blob.size > 8 * 1024 * 1024) {
        setError('El vídeo supera el límite de 8 MB')
        return
      }
      const reader = new FileReader()
      reader.onload = () => { onCapture(String(reader.result)); close() }
      reader.onerror = () => setError('No se pudo procesar el vídeo')
      reader.readAsDataURL(blob)
    }
    recorderRef.current = recorder
    recorder.start()
    setRecording(true)
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    setRecording(false)
  }

  return (
    <div className={cn('rounded-2xl border border-slate-200 bg-slate-950 p-3 shadow-inner', className)}>
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} muted={mode === 'photo'} playsInline className="aspect-video w-full object-cover" />
        {starting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/90 text-sm text-white">
            <LoaderCircle className="h-6 w-6 animate-spin" />
            Abriendo cámara…
          </div>
        )}
        {recording && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> Grabando
          </span>
        )}
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={close} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-slate-300 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" /> Cancelar
        </button>
        {!starting && !error && mode === 'photo' && (
          <button type="button" onClick={capturePhoto} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-400">
            <Camera className="h-4 w-4" /> Capturar foto
          </button>
        )}
        {!starting && !error && mode === 'video' && !recording && (
          <button type="button" onClick={startRecording} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white hover:bg-brand-400">
            <Play className="h-4 w-4" /> Empezar grabación
          </button>
        )}
        {recording && (
          <button type="button" onClick={stopRecording} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500">
            <Square className="h-4 w-4 fill-current" /> Detener y usar vídeo
          </button>
        )}
      </div>
      {mode === 'video' && !recording && !error && !starting && <p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><CircleStop className="h-3 w-3" /> El vídeo se guardará en el formulario antes de publicarlo.</p>}
    </div>
  )
}

export default CameraCapture
