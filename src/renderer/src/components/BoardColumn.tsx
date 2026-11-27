import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { getStatusMeta } from '@shared/types'
import type { Requirement, RequirementStatus } from '@shared/types'
import { BoardCard } from './BoardCard'
import { cn } from './ui'

export function BoardColumn({
  status,
  requirements,
  now,
  onMove,
  onQuickAdd,
  highlighted
}: {
  status: RequirementStatus
  requirements: Requirement[]
  now: number
  onMove: (requirement: Requirement, status: RequirementStatus) => void
  onQuickAdd: (status: RequirementStatus) => void
  highlighted: boolean
}) {
  const meta = getStatusMeta(status)
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}`, data: { type: 'column', status } })
  const active = highlighted || isOver

  return (
    <section className={cn('board-column', `board-column-${status}`, active && 'is-drop-target')} aria-labelledby={`column-${status}`}>
      <header className="column-header">
        <div className="column-title-row">
          <span className={`status-dot status-tone-${status}`} aria-hidden="true" />
          <h2 id={`column-${status}`} className="column-title">{meta.label}</h2>
          <span className="column-count" aria-label={`${requirements.length} 条`}>{requirements.length}</span>
          <span className="column-spacer" />
          <button
            type="button"
            className="column-add"
            aria-label={`在${meta.label}中新建需求`}
            title={`在${meta.label}中新建需求`}
            onClick={() => onQuickAdd(status)}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
        <p className="column-description">{meta.description}</p>
      </header>

      <div ref={setNodeRef} className={cn('column-body', active && 'is-over')}>
        <SortableContext items={requirements.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          {requirements.map((requirement) => (
            <BoardCard key={requirement.id} requirement={requirement} now={now} onMove={onMove} />
          ))}
        </SortableContext>
        {requirements.length === 0 ? (
          <div className="column-empty">
            <span className="column-empty-line" aria-hidden="true" />
            <p>{status === 'done' ? '完成的需求会留在这里' : '拖到这里，或点右上角 + 新建'}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
