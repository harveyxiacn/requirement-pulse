import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { STATUS_META } from '@shared/types'
import type { RequirementStatus } from '@shared/types'

export function StatusMenu({
  value,
  onSelect,
  trigger,
  align = 'start',
  disabled
}: {
  value: RequirementStatus
  onSelect: (status: RequirementStatus) => void
  trigger: ReactNode
  align?: 'start' | 'center' | 'end'
  disabled?: boolean
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        {trigger}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu-content" align={align} sideOffset={6} collisionPadding={12}>
          <DropdownMenu.Label className="menu-label">移动到</DropdownMenu.Label>
          {STATUS_META.map((status) => {
            const current = value === status.value
            return (
              <DropdownMenu.Item
                key={status.value}
                className="menu-item"
                disabled={current}
                onSelect={() => onSelect(status.value)}
              >
                <span className={`status-dot status-tone-${status.value}`} aria-hidden="true" />
                <span className="menu-item-main">
                  <span>{status.label}</span>
                  <span className="menu-item-hint">{status.description}</span>
                </span>
                {current ? <Check size={14} className="menu-check" aria-hidden="true" /> : null}
              </DropdownMenu.Item>
            )
          })}
          <DropdownMenu.Arrow className="menu-arrow" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function ChevronDownIcon() {
  return <ChevronDown size={14} aria-hidden="true" />
}
