import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  MessageSquare,
  Pencil,
  Radio,
  Send,
  Sparkles,
  Trash2,
  User,
  WifiOff
} from 'lucide-react'
import {
  EFFORT_LABELS,
  getStatusMeta,
  isClaimActive
} from '@shared/types'
import type { Analysis, RequirementStatus } from '@shared/types'
import { applySnapshot, describeError, requireApi, useAppStore } from '../store'
import { useDocumentTitle, useNow } from '../hooks'
import { buildAgentBrief } from '../config'
import { formatAbsolute, formatDateOnly, formatRelative, formatRemaining } from '../format'
import { AnalysisCard } from '../components/AnalysisCard'
import { AgentAvatar, ActorAvatar, actorText, agentKindLabel } from '../components/AgentBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Markdown } from '../components/Markdown'
import { RequirementDialog } from '../components/RequirementDialog'
import { StatusMenu } from '../components/StatusMenu'
import { copyText, toast } from '../components/Toast'
import {
  Button,
  EmptyState,
  IconButton,
  PriorityBadge,
  StatusDot,
  Switch,
  cn
} from '../components/ui'

export function RequirementPage() {
  const { id } = useParams<{ id: string }>()
  const snapshot = useAppStore((state) => state.snapshot)
  const navigate = useNavigate()
  const now = useNow(30_000)

  const requirement = snapshot?.data.requirements.find((item) => item.id === id)
  useDocumentTitle(requirement ? `${requirement.code} · ${requirement.title}` : '需求详情')

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [acceptTarget, setAcceptTarget] = useState<{ analysis: Analysis | null } | null>(null)
  const [acceptPending, setAcceptPending] = useState(false)
  const [readyPending, setReadyPending] = useState<boolean | null>(null)
  const [readySaving, setReadySaving] = useState(false)
  const [comment, setComment] = useState('')
  const [commentPending, setCommentPending] = useState(false)

  if (!snapshot) return null

  if (!requirement) {
    return (
      <div className="page-scroll">
        <div className="page-content centered-state">
          <EmptyState
            icon={<Sparkles size={24} />}
            title="这条需求不在这里"
            description="它可能已被删除，或链接已经过期。"
            action={
              <Link to="/" className="btn btn-secondary btn-md">
                <ArrowLeft size={14} aria-hidden="true" />
                <span>回到需求看板</span>
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  const claimActive = isClaimActive(requirement.claim, now)
  const analyses = [...requirement.analyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const comments = [...requirement.comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const acceptedAnalysis = requirement.acceptedAnalysisId
    ? requirement.analyses.find((analysis) => analysis.id === requirement.acceptedAnalysisId)
    : null
  const bridge = snapshot.bridge
  const effortLabel = requirement.effort ? EFFORT_LABELS[requirement.effort] ?? requirement.effort : null
  const sourceIsUrl = Boolean(requirement.source && /^https?:\/\//i.test(requirement.source))

  async function moveTo(status: RequirementStatus): Promise<void> {
    if (!requirement) return
    if (status === requirement.status) return
    try {
      const next = await requireApi().moveRequirement({ id: requirement.id, status, index: 1000 })
      applySnapshot(next)
      toast(`已移到「${getStatusMeta(status).label}」`, 'success')
    } catch (error) {
      toast(describeError(error), 'error')
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!requirement) return
    setDeletePending(true)
    try {
      const next = await requireApi().deleteRequirement(requirement.id)
      applySnapshot(next)
      toast(`${requirement.code} 已删除`, 'success')
      navigate('/')
    } catch (error) {
      toast(describeError(error), 'error')
    } finally {
      setDeletePending(false)
      setDeleteOpen(false)
    }
  }

  async function confirmAccept(): Promise<void> {
    if (!requirement || !acceptTarget) return
    setAcceptPending(true)
    try {
      const next = await requireApi().acceptAnalysis({
        requirementId: requirement.id,
        analysisId: acceptTarget.analysis?.id ?? null
      })
      applySnapshot(next)
      toast(acceptTarget.analysis ? '已采纳这条分析' : '已撤销采纳', 'success')
      setAcceptTarget(null)
    } catch (error) {
      toast(describeError(error), 'error')
    } finally {
      setAcceptPending(false)
    }
  }

  async function applyAgentReady(nextValue: boolean): Promise<void> {
    if (!requirement) return
    setReadySaving(true)
    try {
      const next = await requireApi().updateRequirement(requirement.id, { agentReady: nextValue })
      applySnapshot(next)
      toast(nextValue ? '已开放给 Agent 分析' : '已关闭 Agent 协作', 'success')
      setReadyPending(null)
    } catch (error) {
      toast(describeError(error), 'error')
    } finally {
      setReadySaving(false)
    }
  }

  function requestAgentReady(nextValue: boolean): void {
    if (!requirement) return
    if (!nextValue && claimActive) {
      setReadyPending(false)
      return
    }
    void applyAgentReady(nextValue)
  }

  async function submitComment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!requirement || !comment.trim() || commentPending) return
    setCommentPending(true)
    try {
      const next = await requireApi().addComment({
        requirementId: requirement.id,
        body: comment.trim()
      })
      applySnapshot(next)
      setComment('')
      toast('评论已添加', 'success')
    } catch (error) {
      toast(describeError(error), 'error')
    } finally {
      setCommentPending(false)
    }
  }

  function copyBrief(): void {
    if (!requirement) return
    void copyText(buildAgentBrief(requirement), 'Agent 上下文已复制')
  }

  return (
    <div className="page-scroll">
      <div className="page-content detail-page">
        <div className="detail-breadcrumb">
          <Link to="/" className="back-link">
            <ArrowLeft size={14} aria-hidden="true" />
            需求看板
          </Link>
          <span className="crumb-separator" aria-hidden="true">/</span>
          <span className="crumb-code">{requirement.code}</span>
          <span className="detail-save-state">
            <CheckCircle2 size={12} aria-hidden="true" />
            本地已保存
          </span>
        </div>

        <header className="detail-header">
          <div className="detail-kicker">
            <PriorityBadge priority={requirement.priority} withLabel />
            <StatusMenu
              value={requirement.status}
              onSelect={(status) => void moveTo(status)}
              trigger={
                <button type="button" className="status-trigger status-trigger-lg">
                  <StatusDot status={requirement.status} />
                  <span>{getStatusMeta(requirement.status).label}</span>
                  <ChevronDown size={13} aria-hidden="true" />
                </button>
              }
            />
            {requirement.dueDate ? (
              <span className="detail-due">
                <CalendarDays size={12} aria-hidden="true" />
                期望 {formatDateOnly(requirement.dueDate)}
              </span>
            ) : null}
          </div>

          <div className="detail-title-row">
            <h1 className="detail-title">{requirement.title}</h1>
            <div className="detail-actions">
              <Button variant="secondary" size="sm" icon={<Pencil size={13} />} onClick={() => setEditOpen(true)}>
                编辑
              </Button>
              <IconButton label="删除需求" size="md" onClick={() => setDeleteOpen(true)} className="icon-btn-danger">
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
            </div>
          </div>

          <div className="detail-meta-row">
            {requirement.tags.length > 0 ? (
              <div className="detail-tags">
                {requirement.tags.map((tag) => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
            ) : (
              <span className="muted">无标签</span>
            )}
            {requirement.source ? (
              <span className="detail-source">
                <span className="meta-label">来源</span>
                {sourceIsUrl ? (
                  <button
                    type="button"
                    className="source-link"
                    onClick={() => void requireApi().openExternal(requirement.source!)}
                  >
                    {requirement.source}
                    <ExternalLink size={11} aria-hidden="true" />
                  </button>
                ) : (
                  <span>{requirement.source}</span>
                )}
              </span>
            ) : null}
            <span className="detail-created">
              <span className="meta-label">由</span>
              {requirement.createdBy}
              <span className="meta-label">创建于</span>
              {formatRelative(requirement.createdAt, now)}
            </span>
          </div>
        </header>

        <div className="detail-grid">
          <div className="detail-main">
            <section className="panel content-panel" aria-labelledby="description-heading">
              <header className="panel-heading">
                <h2 id="description-heading">需求说明</h2>
              </header>
              {requirement.description ? (
                <Markdown>{requirement.description}</Markdown>
              ) : (
                <p className="panel-empty">还没有填写说明。编辑需求，把背景和边界写清楚。</p>
              )}
            </section>

            <section className="panel content-panel" aria-labelledby="acceptance-heading">
              <header className="panel-heading">
                <h2 id="acceptance-heading">验收标准</h2>
                <span className="panel-hint">只有你能修改</span>
              </header>
              {requirement.acceptanceCriteria ? (
                <Markdown>{requirement.acceptanceCriteria}</Markdown>
              ) : (
                <p className="panel-empty">还没有验收标准。没有完成定义的需求，很容易被无限延长。</p>
              )}
            </section>

            <section className="panel content-panel analyses-panel" aria-labelledby="analyses-heading">
              <header className="panel-heading">
                <div className="panel-heading-title">
                  <h2 id="analyses-heading">Agent 分析</h2>
                  <span className="count-pill">{analyses.length}</span>
                </div>
                <span className="panel-hint">采纳权只属于人</span>
              </header>
              <p className="sr-only" aria-live="polite">
                {analyses.length > 0
                  ? `当前有 ${analyses.length} 条分析${acceptedAnalysis ? '，已采纳一条' : '，尚未采纳'}`
                  : '当前没有分析'}
              </p>

              {acceptedAnalysis ? (
                <div className="accepted-summary">
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <p>
                    当前决策依据来自 <strong>{acceptedAnalysis.agent.name}</strong> 的分析，提交于
                    <time dateTime={acceptedAnalysis.createdAt}> {formatRelative(acceptedAnalysis.createdAt, now)}</time>。
                  </p>
                </div>
              ) : null}

              {analyses.length > 0 ? (
                <div className="analysis-list">
                  {analyses.map((analysis) => (
                    <AnalysisCard
                      key={analysis.id}
                      analysis={analysis}
                      accepted={analysis.id === requirement.acceptedAnalysisId}
                      now={now}
                      onAccept={() => setAcceptTarget({ analysis })}
                      onUnaccept={() => setAcceptTarget({ analysis: null })}
                    />
                  ))}
                </div>
              ) : (
                <div className="analysis-empty">
                  <span className="analysis-empty-icon" aria-hidden="true">
                    <Sparkles size={20} />
                  </span>
                  <div>
                    <h3>还没有 Agent 分析</h3>
                    <p>
                      {requirement.agentReady
                        ? '需求已开放给 Agent。接入 Claude Code、Codex 或 DeepSeek 后，它们可以领取并回写结构化分析。'
                        : '这条需求目前只允许人工处理。打开 Agent 协作后，Agent 才能读取和写回分析。'}
                    </p>
                  </div>
                  <div className="analysis-empty-actions">
                    <Button variant="secondary" size="sm" icon={<Copy size={13} />} onClick={copyBrief}>
                      复制上下文
                    </Button>
                    {!requirement.agentReady ? (
                      <Button variant="ghost" size="sm" onClick={() => requestAgentReady(true)}>
                        开放给 Agent
                      </Button>
                    ) : (
                      <Link to="/agents" className="btn btn-ghost btn-sm">
                        <span>查看接入配置</span>
                        <ArrowRight size={13} aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="panel content-panel comments-panel" aria-labelledby="comments-heading">
              <header className="panel-heading">
                <div className="panel-heading-title">
                  <h2 id="comments-heading">评论与决策记录</h2>
                  <span className="count-pill">{comments.length}</span>
                </div>
                <span className="panel-hint">人和 Agent 都可以留下上下文</span>
              </header>

              {comments.length > 0 ? (
                <ol className="comment-list">
                  {comments.map((entry) => (
                    <li key={entry.id} className="comment-item">
                      <ActorAvatar actor={entry.author} size="sm" />
                      <div className="comment-body">
                        <div className="comment-meta">
                          <strong>{entry.author.kind === 'human' ? `${entry.author.name}（你）` : entry.author.name}</strong>
                          <span>{actorText(entry.author)}</span>
                          <time dateTime={entry.createdAt} title={formatAbsolute(entry.createdAt)}>
                            {formatRelative(entry.createdAt, now)}
                          </time>
                        </div>
                        <p className="comment-text">{entry.body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="panel-empty">还没有评论。留下判断依据，比只改状态更有用。</p>
              )}

              <form className="comment-composer" onSubmit={(event) => void submitComment(event)}>
                <label htmlFor="new-comment" className="sr-only">添加评论</label>
                <textarea
                  id="new-comment"
                  className="text-area comment-textarea"
                  rows={3}
                  maxLength={10_000}
                  value={comment}
                  placeholder="补充判断依据、回答 Agent 的开放问题，或记录为什么暂不做…"
                  onChange={(event) => setComment(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                />
                <div className="comment-composer-footer">
                  <span className="composer-hint">Ctrl + Enter 发送 · 支持纯文本</span>
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    icon={<Send size={13} />}
                    loading={commentPending}
                    disabled={!comment.trim()}
                  >
                    添加评论
                  </Button>
                </div>
              </form>
            </section>
          </div>

          <aside className="detail-rail" aria-label="需求元数据与 Agent 协作">
            <section className="panel rail-panel">
              <header className="panel-heading">
                <h2>Agent 协作</h2>
                <span className={cn('rail-status', requirement.agentReady ? 'is-ready' : 'is-closed')}>
                  <span className="agent-ready-dot" aria-hidden="true" />
                  {requirement.agentReady ? '开放中' : '已关闭'}
                </span>
              </header>

              <div className="rail-switch-row">
                <div>
                  <p className="switch-title">开放给 Agent 分析</p>
                  <p className="switch-description">
                    关闭后 Agent 无法领取或回写；已有领取会立即释放。
                  </p>
                </div>
                <Switch
                  checked={requirement.agentReady}
                  onChange={requestAgentReady}
                  label="开放给 Agent 分析"
                  disabled={readySaving}
                />
              </div>

              {!bridge.running ? (
                <div className="rail-warning">
                  <WifiOff size={14} aria-hidden="true" />
                  <div>
                    <p>本地桥接未运行</p>
                    <Link to="/agents">去 Agent 值守检查</Link>
                  </div>
                </div>
              ) : null}

              {requirement.claim ? (
                claimActive ? (
                  <div className={`claim-card agent-kind-${requirement.claim.agent.kind}`}>
                    <div className="claim-card-top">
                      <AgentAvatar agent={requirement.claim.agent} size="md" />
                      <div>
                        <p className="claim-agent-name">{requirement.claim.agent.name}</p>
                        <p className="claim-agent-meta">
                          {agentKindLabel(requirement.claim.agent.kind)}
                          {requirement.claim.agent.model ? ` · ${requirement.claim.agent.model}` : ''}
                        </p>
                      </div>
                    </div>
                    <p className="claim-expiry">
                      <Clock size={12} aria-hidden="true" />
                      {formatRemaining(requirement.claim.expiresAt, now)}
                    </p>
                    <p className="claim-note">其他 Agent 此时提交分析会被拒绝。领取到期后自动释放。</p>
                  </div>
                ) : (
                  <div className="rail-warning">
                    <Clock size={14} aria-hidden="true" />
                    <div>
                      <p>领取已过期</p>
                      <p>下一次操作会自动清理。</p>
                    </div>
                  </div>
                )
              ) : requirement.agentReady ? (
                <div className="claim-idle">
                  <span className="claim-idle-dot" aria-hidden="true" />
                  <p>等待 Agent 领取</p>
                  <span>接入后可自动读取此需求</span>
                </div>
              ) : null}

              <div className="rail-actions">
                <Button variant="secondary" size="sm" icon={<Copy size={13} />} onClick={copyBrief} className="btn-full">
                  复制 Agent 上下文
                </Button>
                <Link to="/agents" className="btn btn-ghost btn-sm btn-full">
                  <Radio size={13} aria-hidden="true" />
                  <span>打开 Agent 值守</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </section>

            <section className="panel rail-panel">
              <header className="panel-heading">
                <h2>详情</h2>
              </header>
              <dl className="detail-list">
                <div>
                  <dt>编号</dt>
                  <dd className="mono">{requirement.code}</dd>
                </div>
                <div>
                  <dt>当前阶段</dt>
                  <dd><StatusDot status={requirement.status} /> {getStatusMeta(requirement.status).label}</dd>
                </div>
                <div>
                  <dt>优先级</dt>
                  <dd><PriorityBadge priority={requirement.priority} withLabel /></dd>
                </div>
                <div>
                  <dt>预估</dt>
                  <dd>{effortLabel ?? '未估算'}</dd>
                </div>
                <div>
                  <dt>创建</dt>
                  <dd>{formatAbsolute(requirement.createdAt)}</dd>
                </div>
                <div>
                  <dt>更新</dt>
                  <dd>{formatAbsolute(requirement.updatedAt)}</dd>
                </div>
                {requirement.completedAt ? (
                  <div>
                    <dt>完成</dt>
                    <dd>{formatAbsolute(requirement.completedAt)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>创建人</dt>
                  <dd><User size={12} aria-hidden="true" /> {requirement.createdBy}</dd>
                </div>
              </dl>
            </section>

            {acceptedAnalysis ? (
              <section className="panel rail-panel rail-decision">
                <header className="panel-heading">
                  <h2>当前决策</h2>
                  <CheckCircle2 size={14} aria-hidden="true" className="rail-decision-icon" />
                </header>
                <p className="rail-decision-summary">{acceptedAnalysis.summary}</p>
                <p className="rail-decision-meta">
                  来自 {acceptedAnalysis.agent.name} · {formatRelative(acceptedAnalysis.createdAt, now)}
                </p>
              </section>
            ) : null}

            <section className="panel rail-panel rail-danger">
              <header className="panel-heading">
                <h2>数据操作</h2>
              </header>
              <p className="switch-description">
                删除后需求与分析会从本地数据中移除；每日备份仍保留在数据目录。
              </p>
              <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setDeleteOpen(true)} className="btn-danger-ghost">
                删除这条需求
              </Button>
            </section>

            <div className="detail-counts" aria-label="协作统计">
              <span><MessageSquare size={12} aria-hidden="true" /> {comments.length} 条评论</span>
              <span><Sparkles size={12} aria-hidden="true" /> {analyses.length} 条分析</span>
            </div>
          </aside>
        </div>
      </div>

      <RequirementDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        requirement={requirement}
        onSaved={() => toast('需求已更新', 'success')}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`删除 ${requirement.code}？`}
        description="这会从看板和本地 board.json 中移除这条需求及其分析、评论。每日备份不会立即删除，但无法在应用内撤销。"
        confirmLabel="删除需求"
        tone="danger"
        pending={deletePending}
        onConfirm={() => void confirmDelete()}
      />

      <ConfirmDialog
        open={acceptTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAcceptTarget(null)
        }}
        title={acceptTarget?.analysis ? '采纳这条分析？' : '撤销当前采纳？'}
        description={
          acceptTarget?.analysis
            ? `采纳 ${acceptTarget.analysis.agent.name} 的分析会把它标记为当前决策依据，并替换之前已采纳的分析。只有人类可以做出这个决定。`
            : '撤销后，需求将回到「有分析待判断」的状态。分析内容本身不会删除。'
        }
        confirmLabel={acceptTarget?.analysis ? '确认采纳' : '撤销采纳'}
        pending={acceptPending}
        onConfirm={() => void confirmAccept()}
      />

      <ConfirmDialog
        open={readyPending === false}
        onOpenChange={(open) => {
          if (!open) setReadyPending(null)
        }}
        title="关闭 Agent 协作并释放领取？"
        description={`${requirement.claim?.agent.name ?? '当前 Agent'} 的领取会被立即释放，进行中的分析可能无法回写。之后 Agent 不会再看到这条需求。`}
        confirmLabel="关闭并释放"
        tone="danger"
        pending={readySaving}
        onConfirm={() => void applyAgentReady(false)}
      />
    </div>
  )
}
