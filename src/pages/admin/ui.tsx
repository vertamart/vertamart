import { useEffect, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react'
import { cn } from '../../lib/cn'

/* ------------------------------- Modal ---------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        className={cn(
          'max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

/* ---------------------------- ConfirmModal ------------------------------ */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Eliminar',
  loading,
  danger = true,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: ReactNode
  confirmLabel?: string
  loading?: boolean
  danger?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-slate-600">{message}</div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50">
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={cn(
            'rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-50',
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700',
          )}
        >
          {loading ? 'Procesando…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

/* ----------------------------- EmptyState ------------------------------- */
export function EmptyState({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">{icon ?? <Inbox className="h-7 w-7" />}</div>
      <h3 className="mt-4 text-base font-bold text-slate-800">{title}</h3>
      {subtitle && <p className="mt-1 max-w-sm text-sm text-slate-500">{subtitle}</p>}
    </div>
  )
}

/* ------------------------------ Skeleton -------------------------------- */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  )
}

/* ----------------------------- StatusBadge ------------------------------ */
const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-50 text-green-700 ring-green-600/20',
  hidden: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  paid: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  shipped: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  delivered: 'bg-green-50 text-green-700 ring-green-600/20',
  cancelled: 'bg-red-50 text-red-600 ring-red-600/20',
  approved: 'bg-green-50 text-green-700 ring-green-600/20',
  declined: 'bg-red-50 text-red-600 ring-red-600/20',
  full: 'bg-red-50 text-red-600 ring-red-600/20',
  partial: 'bg-orange-50 text-orange-700 ring-orange-600/20',
  none: 'bg-slate-100 text-slate-500 ring-slate-500/20',
  suspended: 'bg-red-50 text-red-600 ring-red-600/20',
  ok: 'bg-green-50 text-green-700 ring-green-600/20',
  received: 'bg-green-50 text-green-700 ring-green-600/20',
  refunded: 'bg-slate-100 text-slate-500 ring-slate-500/20',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset', STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600 ring-slate-500/20')}>
      {label ?? status}
    </span>
  )
}

/* ------------------------------ StatCard -------------------------------- */
export function StatCard({
  label,
  value,
  icon,
  tone = 'brand',
  hint,
}: {
  label: string
  value: ReactNode
  icon: ReactNode
  tone?: 'brand' | 'blue' | 'green' | 'amber' | 'purple' | 'red'
  hint?: string
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  }
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn('mb-3 flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105', tones[tone])}>{icon}</div>
      <p className="text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 text-sm text-slate-500">{label}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

/* ------------------------------ SearchInput ------------------------------ */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Buscar…'}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  )
}

/* ------------------------------- BulkBar -------------------------------- */
export function BulkBar({
  count,
  children,
  onClear,
}: {
  count: number
  children: ReactNode
  onClear: () => void
}) {
  if (count === 0) return null
  return (
    <div className="sticky top-16 z-30 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-brand-200 bg-brand-50/90 px-3 py-2.5 shadow-lg backdrop-blur">
      <span className="mr-1 rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
        {count} seleccionado{count !== 1 ? 's' : ''}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      <button onClick={onClear} className="ml-auto rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-white/70">
        Deseleccionar
      </button>
    </div>
  )
}

export function BulkButton({ onClick, children, danger, disabled }: { onClick: () => void; children: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-40',
        danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white text-brand-700 shadow-sm ring-1 ring-inset ring-brand-200 hover:bg-brand-100',
      )}
    >
      {children}
    </button>
  )
}

/* ------------------------------ Pagination ------------------------------ */
export function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm">
      <p className="text-xs text-slate-400">{total} elementos</p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-30"
          aria-label="Anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="px-3 font-semibold text-slate-600">
          {page} / {pages}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pages}
          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-30"
          aria-label="Siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ FilterChip ------------------------------ */
export function FilterChip({ label, active, onClick, tone }: { label: string; active: boolean; onClick: () => void; tone?: 'green' | 'red' | 'amber' | 'blue' }) {
  const tones: Record<string, string> = {
    green: 'bg-green-100 text-green-800 ring-green-600/20',
    red: 'bg-red-100 text-red-700 ring-red-600/20',
    amber: 'bg-amber-100 text-amber-800 ring-amber-600/20',
    blue: 'bg-blue-100 text-blue-700 ring-blue-600/20',
  }
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-bold ring-1 ring-inset transition-all',
        active ? (tone ? tones[tone] : 'bg-brand-100 text-brand-800 ring-brand-600/20') : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50',
      )}
    >
      {label}
    </button>
  )
}

/* ------------------------------- Field ---------------------------------- */
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  )
}

export const inputCls = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
export const textareaCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100'
