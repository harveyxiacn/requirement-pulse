import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { getPriorityMeta, getStatusMeta } from '@shared/types'
import type { Priority, RequirementStatus } from '@shared/types'

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, icon, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn('btn', `btn-${variant}`, `btn-${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 size={14} className="spin" aria-hidden="true" /> : icon}
      {children ? <span>{children}</span> : null}
    </button>
  )
})

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'secondary' | 'danger'
  children: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', variant = 'ghost', className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn('icon-btn', `icon-btn-${size}`, `icon-btn-${variant}`, className)}
      {...props}
    >
      {children}
    </button>
  )
})

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>
}

export function Spinner({ label = '加载中' }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <Loader2 size={16} className="spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  describedBy
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
  describedBy?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      className="switch"
      data-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  )
}

export function PriorityBadge({ priority, withLabel = false }: { priority: Priority; withLabel?: boolean }) {
  const meta = getPriorityMeta(priority)
  return (
    <span className={`priority-badge priority-${priority}`} title={meta.description}>
      <span className="priority-code">{meta.code}</span>
      {withLabel ? <span>{meta.label}</span> : <span className="sr-only">{meta.label}</span>}
    </span>
  )
}

export function StatusDot({ status }: { status: RequirementStatus }) {
  return <span className={`status-dot status-tone-${status}`} aria-hidden="true" />
}

export function StatusLabel({ status }: { status: RequirementStatus }) {
  return (
    <span className="status-label">
      <StatusDot status={status} />
      {getStatusMeta(status).label}
    </span>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      {icon ? <div className="empty-icon" aria-hidden="true">{icon}</div> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>
}
