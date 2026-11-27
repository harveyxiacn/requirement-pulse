import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import {
  AlertTriangle,
  ChevronDown,
  Inbox,
  LayoutGrid,
  List,
  Plus,
  Radio,
  Search,
  Sparkles,
  X
} from 'lucide-react'
import {
  PRIORITY_META,
  STATUS_ORDER,
  getStatusMeta,
  isClaimActive
} from '@shared/types'
import type { Priority, Requirement, RequirementStatus } from '@shared/types'
import { applySnapshot, describeError, requireApi, useAppStore, useUiStore } from '../store'
import { useNow, useReducedMotion } from '../hooks'
import { formatAbsolute, formatRelative } from '../format'
import { BoardColumn } from '../components/BoardColumn'
import { CardPreview } from '../components/BoardCard'
import { StatusMenu } from '../components/StatusMenu'
import { AgentAvatar } from '../components/AgentBadge'
import { EmptyState, Kbd, PriorityBadge, StatusDot, cn } from '../components/ui'
import { toast } from '../components/Toast'

type ViewMode = 'board' | 'list'

const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) {
    const card = pointerCollisions.find((collision) => !String(collision.id).startsWith('column:'))
    return card ? [card] : [pointerCollisions[0]]
  }
  return closestCorners(args)
}

function readViewMode(): ViewMode {
  try {
    return window.localStorage.getItem('pulse:board-view') === 'list' ? 'list' : 'board'
  } catch {
    return 'board'
  }
}

export function BoardPage() {
  const snapshot = useAppStore((state) => state.snapshot)
  const navigate = useNavigate()
  const openCreate = useUiStore((state) => state.openCreate)
  const openPalette = useUiStore((state) => state.openPalette)
  const now = useNow(30_000)
  const reducedMotion = useReducedMotion()
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState<'all' | Priority>('all')
  const [agentOnly, setAgentOnly] = useState(false)
  const [view, setView] = useState<ViewMode>(readViewMode)
  const [activeRequirement, setActiveRequirement] = useState<Requirement | null>(null)
  const [overStatus, setOverStatus] = useState<RequirementStatus | null>(null)
  const [noticeDismissed, setNoticeDismissed] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    try {
      window.localStorage.setItem('pulse:board-view', view)
    } catch {
      // Per-viewer convenience only.
    }
  }, [view])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key.toLowerCase() !== 'n') return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      const ui = useUiStore.getState()
      if (ui.paletteOpen || ui.createOpen) return
      event.preventDefault()
      openCreate('inbox')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openCreate])

  const requirements = snapshot?.data.requirements ?? []

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return requirements.filter((requirement) => {
      if (priority !== 'all' && requirement.priority !== priority) return false
      if (agentOnly && !requirement.agentReady) return false
      if (query) {
        const haystack = [
          requirement.code,
          requirement.title,
          requirement.description,
          requirement.tags.join(' ')
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [requirements, search, priority, agentOnly])

  const columns = useMemo(() => {
    const result: Record<RequirementStatus, Requirement[]> = {
      inbox: [],
      planned: [],
      building: [],
      review: [],
      done: []
    }
    for (const requirement of filtered) {
      result[requirement.status].push(requirement)
    }
    for (const status of STATUS_ORDER) {
      result[status].sort((a, b) => a.order - b.order)
    }
    return result
  }, [filtered])

  const listRows = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const order = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
      if (order !== 0) return order
      return a.order - b.order
    })
  }, [filtered])

  if (!snapshot) return null

  const openCount = requirements.filter((requirement) => requirement.status !== 'done').length
  const reviewCount = requirements.filter((requirement) => requirement.status === 'review').length
  const activeClaims = requirements.filter((requirement) => isClaimActive(requirement.claim, now)).length
  const pendingAnalysis = requirements.filter(
    (requirement) => requirement.analyses.length > 0 && !requirement.acceptedAnalysisId
  ).length
  const filtersActive = Boolean(search.trim()) || priority !== 'all' || agentOnly

  function clearFilters(): void {
    setSearch('')
    setPriority('all')
    setAgentOnly(false)
  }

  async function moveTo(requirement: Requirement, status: RequirementStatus): Promise<void> {
    if (requirement.status === status) return
    try {
      const next = await requireApi().moveRequirement({ id: requirement.id, status, index: 1000 })
      applySnapshot(next)
      toast(`${requirement.code} 已移到「${getStatusMeta(status).label}」`, 'success')
    } catch (error) {
      toast(describeError(error), 'error')
    }
  }

  function requirementFromOver(overId: string): {
    status: RequirementStatus
    requirement: Requirement | null
  } | null {
    if (overId.startsWith('column:')) {
      return { status: overId.slice('column:'.length) as RequirementStatus, requirement: null }
    }
    const requirement = requirements.find((item) => item.id === overId)
    return requirement ? { status: requirement.status, requirement } : null
  }

  function handleDragStart(event: DragStartEvent): void {
    const requirement = requirements.find((item) => item.id === event.active.id)
    setActiveRequirement(requirement ?? null)
    setOverStatus(requirement?.status ?? null)
    document.body.classList.add('is-dragging')
  }

  function handleDragOver(event: DragOverEvent): void {
    if (!event.over) {
      setOverStatus(null)
      return
    }
    const target = requirementFromOver(String(event.over.id))
    setOverStatus(target?.status ?? null)
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const active = activeRequirement
    setActiveRequirement(null)
    setOverStatus(null)
    document.body.classList.remove('is-dragging')
    if (!active || !event.over) return
    const overId = String(event.over.id)
    if (overId === active.id) return

    let targetStatus: RequirementStatus
    let overRequirement: Requirement | null = null
    if (overId.startsWith('column:')) {
      targetStatus = overId.slice('column:'.length) as RequirementStatus
    } else {
      const over = requirements.find((item) => item.id === overId)
      if (!over) return
      targetStatus = over.status
      overRequirement = over
    }

    const destination = requirements
      .filter((item) => item.status === targetStatus && item.id !== active.id)
      .sort((a, b) => a.order - b.order)
    let index = destination.length
    if (overRequirement) {
      const overIndex = destination.findIndex((item) => item.id === overRequirement.id)
      if (overIndex >= 0) index = overIndex
    }

    if (active.status === targetStatus) {
      const currentList = destination.map((item) => item.id)
      const currentIndex = requirements
        .filter((item) => item.status === targetStatus)
        .sort((a, b) => a.order - b.order)
        .findIndex((item) => item.id === active.id)
      if (currentIndex === index && !overRequirement) return
      if (currentList[index] === undefined && index === destination.length) {
        const lastId = currentList[currentList.length - 1]
        if (lastId === active.id) return
      }
    }

    try {
      const next = await requireApi().moveRequirement({
        id: active.id,
        status: targetStatus,
        index
      })
      applySnapshot(next)
      if (active.status !== targetStatus) {
        toast(`${active.code} 已移到「${getStatusMeta(targetStatus).label}」`, 'success')
      }
    } catch (error) {
      toast(describeError(error), 'error')
    }
  }

  function handleDragCancel(): void {
    setActiveRequirement(null)
    setOverStatus(null)
    document.body.classList.remove('is-dragging')
  }

  return (
    <div className="board-page">
      <header className="board-header">
        <div className="board-title-row">
          <div className="board-title-block">
            <p className="eyebrow">DECISION BOARD · 05 STAGES</p>
            <h1 className="page-title">需求看板</h1>
            <p className="board-subtitle">
              {openCount > 0 ? `${openCount} 条未完成` : '所有需求都已闭环'} · 分析先到达，采纳由你决定。
            </p>
          </div>
          <div className="board-actions">
            <button type="button" className="search-trigger" onClick={openPalette}>
              <Search size={14} aria-hidden="true" />
              <span>查找或执行命令</span>
              <Kbd>Ctrl K</Kbd>
            </button>
            <button type="button" className="btn btn-primary btn-md" onClick={() => openCreate('inbox')}>
              <Plus size={15} aria-hidden="true" />
              <span>新建需求</span>
              <Kbd>N</Kbd>
            </button>
          </div>
        </div>

        <div className="board-pulse" aria-label="看板概览">
          <span className="pulse-item">
            <span className={`bridge-status-dot ${activeClaims > 0 ? 'dot-online' : 'dot-offline'}`} aria-hidden="true" />
            {activeClaims > 0 ? `${activeClaims} 个 Agent 正在分析` : '暂无 Agent 领取'}
          </span>
          <span className="pulse-separator" aria-hidden="true" />
          <span className="pulse-item">
            <Sparkles size={12} aria-hidden="true" />
            {pendingAnalysis > 0 ? `${pendingAnalysis} 条需求有待判断分析` : '分析区已清空'}
          </span>
          <span className="pulse-separator" aria-hidden="true" />
          <span className="pulse-item">
            <span className="status-dot status-tone-review" aria-hidden="true" />
            {reviewCount} 条待验收
          </span>
        </div>
      </header>

      {snapshot.startupNotice && !noticeDismissed ? (
        <div className="notice-banner" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <p>{snapshot.startupNotice}</p>
          <button type="button" className="notice-close" aria-label="关闭提示" onClick={() => setNoticeDismissed(true)}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {requirements.length === 0 ? (
        <div className="first-run">
          <EmptyState
            icon={<Inbox size={26} />}
            title="把第一条需求放进来"
            description="先记下想法，再决定是否规划。开放给 Agent 后，Claude Code、Codex 或 DeepSeek 可以读取并写回分析。"
            action={
              <div className="first-run-actions">
                <button type="button" className="btn btn-primary btn-md" onClick={() => openCreate('inbox')}>
                  <Plus size={15} aria-hidden="true" />
                  <span>新建需求</span>
                </button>
                <button type="button" className="btn btn-secondary btn-md" onClick={() => navigate('/agents')}>
                  <Radio size={15} aria-hidden="true" />
                  <span>配置 Agent 接入</span>
                </button>
              </div>
            }
          />
          <div className="first-run-steps" aria-label="工作流">
            <div><span>01</span><p>记下需求与验收标准</p></div>
            <div><span>02</span><p>Agent 领取并写回结构化分析</p></div>
            <div><span>03</span><p>你判断是否采纳，再推进阶段</p></div>
          </div>
        </div>
      ) : (
        <>
          <div className="board-toolbar" role="search" aria-label="筛选需求">
            <div className="search-field">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                value={search}
                placeholder="搜索编号、标题、标签…"
                aria-label="搜索需求"
                onChange={(event) => setSearch(event.target.value)}
              />
              {search ? (
                <button type="button" className="search-clear" aria-label="清空搜索" onClick={() => setSearch('')}>
                  <X size={13} aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <div className="filter-group" role="group" aria-label="按优先级筛选">
              <button
                type="button"
                className={cn('filter-chip', priority === 'all' && 'is-active')}
                aria-pressed={priority === 'all'}
                onClick={() => setPriority('all')}
              >
                全部
              </button>
              {PRIORITY_META.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn('filter-chip', `filter-chip-${item.value}`, priority === item.value && 'is-active')}
                  aria-pressed={priority === item.value}
                  title={item.description}
                  onClick={() => setPriority(item.value)}
                >
                  {item.code}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={cn('filter-chip filter-chip-agent', agentOnly && 'is-active')}
              aria-pressed={agentOnly}
              onClick={() => setAgentOnly((current) => !current)}
            >
              <Radio size={12} aria-hidden="true" />
              仅 Agent 就绪
            </button>

            {filtersActive ? (
              <button type="button" className="link-button" onClick={clearFilters}>
                清除筛选
              </button>
            ) : null}

            <span className="toolbar-spacer" />
            <span className="result-count" aria-live="polite">
              显示 {filtered.length} / {requirements.length}
            </span>
            <div className="view-switch" role="group" aria-label="视图切换">
              <button
                type="button"
                className={cn('view-switch-button', view === 'board' && 'is-active')}
                aria-pressed={view === 'board'}
                aria-label="看板视图"
                title="看板视图"
                onClick={() => setView('board')}
              >
                <LayoutGrid size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={cn('view-switch-button', view === 'list' && 'is-active')}
                aria-pressed={view === 'list'}
                aria-label="列表视图"
                title="列表视图"
                onClick={() => setView('list')}
              >
                <List size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="no-results" role="status">
              <Search size={18} aria-hidden="true" />
              <p>没有匹配的需求。</p>
              <button type="button" className="link-button" onClick={clearFilters}>清除筛选</button>
            </div>
          ) : view === 'board' ? (
            <DndContext
              sensors={sensors}
              collisionDetection={collisionDetection}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={(event) => void handleDragEnd(event)}
              onDragCancel={handleDragCancel}
              accessibility={{
                screenReaderInstructions: {
                  draggable:
                    '按空格键拿起需求。使用方向键在列之间移动，按空格键放下，按 Escape 取消。也可以在卡片菜单中选择「移动到」。'
                },
                announcements: {
                  onDragStart({ active }) {
                    const requirement = requirements.find((item) => item.id === active.id)
                    return requirement
                      ? `已拿起 ${requirement.code}，${requirement.title}。使用方向键移动到目标列，空格键放下。`
                      : '已拿起需求。'
                  },
                  onDragOver({ over }) {
                    if (!over) return '当前不在任何列上方。'
                    const target = requirementFromOver(String(over.id))
                    return target ? `正在「${getStatusMeta(target.status).label}」上方。` : '正在移动。'
                  },
                  onDragEnd({ over }) {
                    if (!over) return '已取消移动。'
                    const target = requirementFromOver(String(over.id))
                    return target ? `已在「${getStatusMeta(target.status).label}」放下，正在保存。` : '已放下。'
                  },
                  onDragCancel() {
                    return '已取消拖动，需求没有移动。'
                  }
                }
              }}
            >
              <div className="board-columns" aria-label="需求看板列">
                {STATUS_ORDER.map((status) => (
                  <BoardColumn
                    key={status}
                    status={status}
                    requirements={columns[status]}
                    now={now}
                    onMove={(requirement, nextStatus) => void moveTo(requirement, nextStatus)}
                    onQuickAdd={openCreate}
                    highlighted={Boolean(activeRequirement && overStatus === status)}
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={reducedMotion ? null : { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
                {activeRequirement ? (
                  <div className="drag-overlay-card">
                    <CardPreview requirement={activeRequirement} now={now} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="list-view">
              <table className="requirement-table">
                <caption className="sr-only">需求列表，可按状态移动需求</caption>
                <thead>
                  <tr>
                    <th scope="col">需求</th>
                    <th scope="col">优先级</th>
                    <th scope="col">阶段</th>
                    <th scope="col">Agent</th>
                    <th scope="col">分析</th>
                    <th scope="col">更新</th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.map((requirement) => {
                    const claimActive = isClaimActive(requirement.claim, now)
                    return (
                      <tr key={requirement.id}>
                        <td className="table-requirement-cell">
                          <span className="table-code">{requirement.code}</span>
                          <a className="table-title" href={`#/requirement/${requirement.id}`}>
                            {requirement.title}
                          </a>
                          {requirement.tags.length > 0 ? (
                            <span className="table-tags">{requirement.tags.slice(0, 3).join(' · ')}</span>
                          ) : null}
                        </td>
                        <td>
                          <PriorityBadge priority={requirement.priority} withLabel />
                        </td>
                        <td>
                          <StatusMenu
                            value={requirement.status}
                            onSelect={(status) => void moveTo(requirement, status)}
                            trigger={
                              <button type="button" className="status-trigger">
                                <StatusDot status={requirement.status} />
                                <span>{getStatusMeta(requirement.status).label}</span>
                                <ChevronDown size={12} aria-hidden="true" />
                              </button>
                            }
                          />
                        </td>
                        <td>
                          {claimActive && requirement.claim ? (
                            <span className="table-agent">
                              <AgentAvatar agent={requirement.claim.agent} size="sm" />
                              {requirement.claim.agent.name}
                            </span>
                          ) : (
                            <span className={cn('table-agent-state', requirement.agentReady && 'is-ready')}>
                              {requirement.agentReady ? '可分析' : '仅人工'}
                            </span>
                          )}
                        </td>
                        <td>
                          {requirement.analyses.length > 0 ? (
                            <span className={cn('table-analysis', requirement.acceptedAnalysisId && 'is-accepted')}>
                              <Sparkles size={12} aria-hidden="true" />
                              {requirement.analyses.length}
                              {requirement.acceptedAnalysisId ? ' · 已采纳' : ''}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <time className="table-updated" dateTime={requirement.updatedAt} title={formatAbsolute(requirement.updatedAt)}>
                            {formatRelative(requirement.updatedAt, now)}
                          </time>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
