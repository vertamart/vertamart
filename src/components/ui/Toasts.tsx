import { CheckCircle2, Info } from 'lucide-react'
import { useStore } from '../../context/StoreContext'
import { cn } from '../../lib/cn'

export function Toasts() {
  const { toast } = useStore()
  if (!toast) return null
  const Icon = toast.type === 'success' ? CheckCircle2 : Info
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4">
      <div
        key={toast.id}
        role="status"
        className={cn(
          'animate-toast-in pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg',
          toast.type === 'success' ? 'bg-slate-900' : 'bg-brand-600',
        )}
      >
        <Icon className="h-4 w-4" />
        {toast.message}
      </div>
    </div>
  )
}