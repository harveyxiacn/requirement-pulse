import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import {
  CheckCircle2,
  Clock,
  Copy,
  GripVertical,
  MoreHorizontal,
  PencilLine,
  Sparkles
} from 'lucide-react'
import { STATUS_META, isClaimActive } from '@shared/types'
import type { Requirement, RequirementStatus } from '@shared/types'
import { formatRelative, formatRemaining } from '../format'
import { buildAgentBrief } from '../config'
import { AgentAvatar } from './AgentBadge'
import { copyText } from './Toast'
import { PriorityBadge, cn } from './ui'

export function BoardCard({
  requirement,
  now,
  onMove
}: {
  requirement: Requirement
  now: number
  onMove: (requirement: Requirement, status: RequirementStatus) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: requirement.id, data: { type: 'requirement', requirement } })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn('requirement-card', isDragging && 'is-dragging')}
      data-status={requirement.status}
    >
      <CardChrome
        requirement={requirement}
        gripProps={{
          ref: setActivatorNodeRef,
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: listeners as unknown as Record<string, unknown> | undefined
        }}
        onMove={onMove}
      />
      <CardMain requirement={requirement} now={now} />
    </article>
  )
}

export function CardPreview({
  requirement,
  now
}: {
  requirement: Requirement
  now: number
}) {
  return (
    <article className="requirement-card card-preview" data-status={requirement.status}>
      <div className="card-chrome">
        <span className="card-code">{requirement.code}</span>
        <PriorityBadge priority={requirement.priority} />
      </div>
      <CardMain requirement={requirement} now={now} />
    </article>
  )
}

function CardChrome({
  requirement,
  gripProps,
  onMove
}: {
  requirement: Requirement
  gripProps: {
    ref: (element: HTMLElement | null) => void
    attributes: Record<string, unknown>
    listeners: Record<string, unknown> | undefined
  }
  onMove: (requirement: Requirement, status: RequirementStatus) => void
}) {
  const claimActive = isClaimActive(requirement.claim)
  return (
    <div className="card-chrome">
      <span className="card-code">{requirement.code}</span>
      <PriorityBadge priority={requirement.priority} />
      <span className="card-chrome-spacer" />
      {requirement.agentReady ? (
        <span className="agent-ready-mark" title="已开放给 Agent 分析">
          <span className="agent-ready-dot" aria-hidden="true" />
          <span className="sr-only">已开放给 Agent 分析</span>
        </span>
      ) : null}
      <button
        type="button"
        ref={gripProps.ref}
        className="card-grip"
        aria-label={`拖动 ${requirement.code} 调整位置`}
        title="拖动调整位置"
        {...(gripProps.attributes as object)}
        {...(gripProps.listeners as object)}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="card-menu-trigger" aria-label={`${requirement.code} 更多操作`}>
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu-content" align="end" sideOffset={6} collisionPadding={12}>
            <DropdownMenu.Item className="menu-item" asChild>
              <Link to={`/requirement/${requirement.id}`}>
                <PencilLine size={14} aria-hidden="true" />
                <span className="menu-item-main">打开详情</span>
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Label className="menu-label">移动到</DropdownMenu.Label>
            {STATUS_META.map((status) => (
              <DropdownMenu.Item
                key={status.value}
                className="menu-item"
                disabled={requirement.status === status.value}
                onSelect={() => onMove(requirement, status.value)}
              >
                <span className={`status-dot status-tone-${status.value}`} aria-hidden="true" />
                <span className="menu-item-main">{status.label}</span>
              </DropdownMenu.Item>
            ))}
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item
              className="menu-item"
              onSelect={() => {
                void copyText(buildAgentBrief(requirement), 'Agent 上下文已复制')
              }}
            >
              <Copy size={14} aria-hidden="true" />
              <span className="menu-item-main">复制 Agent 上下文</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="menu-item"
              onSelect={() => {
                void copyText(requirement.code, '需求编号已复制')
              }}
            >
              <Copy size={14} aria-hidden="true" />
              <span className="menu-item-main">复制需求编号</span>
            </DropdownMenu.Item>
            {claimActive ? (
              <DropdownMenu.Label className="menu-label menu-label-note">
                {requirement.claim?.agent.name} 正在分析
              </DropdownMenu.Label>
            ) : null}
            <DropdownMenu.Arrow className="menu-arrow" />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}

function CardMain({ requirement, now }: { requirement: Requirement; now: number }) {
  const claimActive = isClaimActive(requirement.claim, now)
  const analysisCount = requirement.analyses.length
  const awaitingDecision = analysisCount > 0 && !requirement.acceptedAnalysisId
  const accepted = Boolean(requirement.acceptedAnalysisId)
  const due = requirement.dueDate ? new Date(`${requirement.dueDate}T23:59:59`) : null
  const dueSoon = due && due.getTime() < now + 3 * 24 * 60 * 60 * 1000
  const visibleTags = requirement.tags.slice(0, 2)

  return (
    <Link
      to={`/requirement/${requirement.id}`}
      className="card-main"
    >
      <h3 className="card-title">{requirement.title}</h3>
      {requirement.description ? (
        <p className="card-description">{requirement.description}</p>
      ) : (
        <p className="card-description card-description-muted">还没有需求说明</p>
      )}

      {visibleTags.length > 0 ? (
        <div className="card-tags">
          {visibleTags.map((tag) => (
            <span key={tag} className="tag">{tag}</span>
          ))}
          {requirement.tags.length > visibleTags.length ? (
            <span className="tag tag-more">+{requirement.tags.length - visibleTags.length}</span>
          ) : null}
        </div>
      ) : null}

      {analysisCount > 0 ? (
        <div className={cn('card-analysis-flag', accepted && 'is-accepted', awaitingDecision && 'is-pending')}>
          {accepted ? <CheckCircle2 size={12} aria-hidden="true" /> : <Sparkles size={12} aria-hidden="true" />}
          <span>
            {accepted ? '已采纳分析' : `${analysisCount} 条分析待判断`}
          </span>
        </div>
      ) : null}

      {claimActive && requirement.claim ? (
        <div className={`card-claim agent-kind-${requirement.claim.agent.kind}`}>
          <AgentAvatar agent={requirement.claim.agent} size="sm" />
          <span className="card-claim-name">{requirement.claim.agent.name}</span>
          <span className="card-claim-time">
            <Clock size={11} aria-hidden="true" />
            {formatRemaining(requirement.claim.expiresAt, now)}
          </span>
        </div>
      ) : null}

      <div className="card-footer">
        {due ? (
          <span className={cn('card-due', dueSoon && 'is-due-soon')}>
            <Clock size={11} aria-hidden="true" />
            {requirement.dueDate?.slice(5).replace('-', '/')}
          </span>
        ) : (
          <span className={cn('card-agent-state', requirement.agentReady ? 'is-ready' : 'is-human')}>
            {requirement.agentReady ? (
              <>
                <span className="agent-ready-dot" aria-hidden="true" />
                可分析
              </>
            ) : (
              '仅人工'
            )}
          </span>
        )}
        <span className="card-footer-spacer" />
        {analysisCount > 0 ? (
          <span className="card-metric" title={`${analysisCount} 条分析`}>
            <Sparkles size={11} aria-hidden="true" />
            {analysisCount}
          </span>
        ) : null}
        <span className="card-updated" title={requirement.updatedAt}>
          {formatRelative(requirement.updatedAt, now)}
        </span>
      </div>
    </Link>
  )
}
