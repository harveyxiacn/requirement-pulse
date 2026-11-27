import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Download,
  Inbox,
  KeyRound,
  MessageSquare,
  PencilLine,
  Radio,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload
} from 'lucide-react'
import type { ActivityType } from '@shared/types'
import { useAppStore } from '../store'
import { useNow } from '../hooks'
import { dayLabel, formatAbsolute, formatRelative } from '../format'
import { ActorAvatar, actorText } from '../components/AgentBadge'
import { EmptyState, cn } from '../components/ui'

type ActivityFilter = 'all' | 'requirement' | 'analysis' | 'claim' | 'data'

const FILTERS: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'requirement', label: '需求' },
  { value: 'analysis', label: '分析' },
  { value: 'claim', label: '领取' },
  { value: 'data', label: '数据' }
]

const ACTIVITY_ICONS: Record<ActivityType, typeof Inbox> = {
  'requirement.created': Inbox,
  'requirement.updated': PencilLine,
  'requirement.status_changed': ArrowRightLeft,
  'requirement.deleted': Trash2,
  'requirement.agent_ready_changed': Radio,
  'analysis.submitted': Sparkles,
  'analysis.accepted': CheckCircle2,
  'analysis.unaccepted': RotateCcw,
  'comment.added': MessageSquare,
  'claim.created': KeyRound,
  'claim.released': KeyRound,
  'claim.expired': Clock,
  'bridge.started': Radio,
  'bridge.stopped': Radio,
  'data.exported': Download,
  'data.imported': Upload
}

function groupOf(type: ActivityType): ActivityFilter {
  if (type.startsWith('requirement.')) return 'requirement'
  if (type.startsWith('analysis.') || type.startsWith('comment.')) return 'analysis'
  if (type.startsWith('claim.')) return 'claim'
  return 'data'
}

function toneOf(type: ActivityType): string {
  if (type === 'analysis.accepted') return 'activity-tone-accept'
  if (type === 'analysis.submitted') return 'activity-tone-analysis'
  if (type === 'requirement.status_changed') return 'activity-tone-status'
  if (type.startsWith('claim.')) return 'activity-tone-claim'
  if (type.startsWith('data.')) return 'activity-tone-data'
  if (type === 'requirement.deleted') return 'activity-tone-danger'
  return 'activity-tone-default'
}

export function ActivityPage() {
  const snapshot = useAppStore((state) => state.snapshot)
  const now = useNow(30_000)
  const [filter, setFilter] = useState<ActivityFilter>('all')

  const activities = snapshot?.data.activities ?? []

  const counts = useMemo(() => {
    const result: Record<ActivityFilter, number> = {
      all: activities.length,
      requirement: 0,
      analysis: 0,
      claim: 0,
      data: 0
    }
    for (const activity of activities) result[groupOf(activity.type)] += 1
    return result
  }, [activities])

  const filtered = useMemo(
    () => (filter === 'all' ? activities : activities.filter((activity) => groupOf(activity.type) === filter)),
    [activities, filter]
  )

  const groups = useMemo(() => {
    const result: Array<{ label: string; items: typeof filtered }> = []
    for (const activity of filtered) {
      const label = dayLabel(activity.createdAt, now)
      const last = result[result.length - 1]
      if (last && last.label === label) last.items.push(activity)
      else result.push({ label, items: [activity] })
    }
    return result
  }, [filtered, now])

  if (!snapshot) return null

  return (
    <div className="page-scroll">
      <div className="page-content activity-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">AUDIT TRAIL</p>
            <h1 className="page-title">活动记录</h1>
            <p className="page-subtitle">
              每一次阶段变化、分析提交、领取和采纳都会留下痕迹。这里展示最近 {activities.length} 条。
            </p>
          </div>
          <div className="live-indicator" role="status">
            <span className={cn('bridge-status-dot', snapshot.bridge.running ? 'dot-online' : 'dot-offline')} aria-hidden="true" />
            {snapshot.bridge.running ? '实时更新中' : '桥接未运行'}
          </div>
        </header>

        <div className="activity-toolbar">
          <div className="filter-group" role="group" aria-label="筛选活动类型">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={cn('filter-chip', filter === item.value && 'is-active')}
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
                <span className="filter-count">{counts[item.value]}</span>
              </button>
            ))}
          </div>
          <span className="toolbar-spacer" />
          <span className="result-count">显示 {filtered.length} / {activities.length}</span>
        </div>

        {filtered.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<Clock size={22} />}
              title="这个范围内还没有活动"
              description="换个筛选，或先去需求看板做一次判断。活动会在写入成功后立即出现。"
            />
          </div>
        ) : (
          <div className="activity-timeline">
            {groups.map((group) => (
              <section key={group.label} className="activity-day" aria-label={group.label}>
                <div className="activity-day-label">
                  <span>{group.label}</span>
                  <span className="activity-day-line" aria-hidden="true" />
                  <span className="activity-day-count">{group.items.length} 条</span>
                </div>
                <ol className="activity-list">
                  {group.items.map((activity) => {
                    const Icon = ACTIVITY_ICONS[activity.type]
                    const requirement = snapshot.data.requirements.find(
                      (item) => item.id === activity.requirementId || item.code === activity.requirementCode
                    )
                    return (
                      <li key={activity.id} className="activity-item">
                        <span className={cn('activity-icon', toneOf(activity.type))} aria-hidden="true">
                          <Icon size={14} />
                        </span>
                        <div className="activity-main">
                          <p className="activity-message">{activity.message}</p>
                          <div className="activity-meta">
                            <ActorAvatar actor={activity.actor} size="sm" />
                            <span>{actorText(activity.actor)}</span>
                            {activity.requirementCode ? (
                              requirement ? (
                                <Link to={`/requirement/${requirement.id}`} className="activity-code">
                                  {activity.requirementCode}
                                </Link>
                              ) : (
                                <span className="activity-code is-gone">{activity.requirementCode}</span>
                              )
                            ) : null}
                            <time dateTime={activity.createdAt} title={formatAbsolute(activity.createdAt)}>
                              {formatRelative(activity.createdAt, now)}
                            </time>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
            <p className="activity-footnote">
              完整历史保存在本机 board.json。为了界面性能，注入到界面的活动上限为 200 条。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
