import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import {
  PRIORITY_META,
  STATUS_META
} from '@shared/types'
import type {
  Priority,
  Requirement,
  RequirementDraft,
  RequirementStatus
} from '@shared/types'
import { applySnapshot, describeError, requireApi, useAppStore } from '../store'
import { splitTags } from '../format'
import { Button, Switch } from './ui'

interface FormState {
  title: string
  description: string
  acceptanceCriteria: string
  status: RequirementStatus
  priority: Priority
  tags: string
  source: string
  effort: string
  dueDate: string
  agentReady: boolean
}

function draftState(requirement: Requirement | undefined, defaultStatus: RequirementStatus): FormState {
  return {
    title: requirement?.title ?? '',
    description: requirement?.description ?? '',
    acceptanceCriteria: requirement?.acceptanceCriteria ?? '',
    status: requirement?.status ?? defaultStatus,
    priority: requirement?.priority ?? 'medium',
    tags: requirement?.tags.join(', ') ?? '',
    source: requirement?.source ?? '',
    effort: requirement?.effort ?? '',
    dueDate: requirement?.dueDate ?? '',
    agentReady: requirement?.agentReady ?? true
  }
}

export function RequirementDialog({
  open,
  onOpenChange,
  requirement,
  defaultStatus = 'inbox',
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  requirement?: Requirement
  defaultStatus?: RequirementStatus
  onSaved?: (requirement: Requirement) => void
}) {
  const [form, setForm] = useState<FormState>(() => draftState(requirement, defaultStatus))
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const initializedFor = useRef<string | null>(null)
  const titleId = useId()
  const descriptionId = useId()
  const acceptanceId = useId()
  const titleErrorId = useId()
  const isEdit = Boolean(requirement)

  useEffect(() => {
    if (!open) {
      initializedFor.current = null
      return
    }
    const key = requirement ? `edit:${requirement.id}` : `new:${defaultStatus}`
    if (initializedFor.current === key) return
    initializedFor.current = key
    setForm(draftState(requirement, defaultStatus))
    setError(null)
    setFieldError(null)
    setSubmitting(false)
  }, [open, requirement, defaultStatus])

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
    if (key === 'title') setFieldError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submitting) return
    const title = form.title.trim()
    if (!title) {
      setFieldError('请先填写需求标题')
      titleRef.current?.focus()
      return
    }

    const draft: RequirementDraft = {
      title,
      description: form.description,
      acceptanceCriteria: form.acceptanceCriteria,
      status: form.status,
      priority: form.priority,
      tags: splitTags(form.tags),
      source: form.source.trim() || undefined,
      effort: form.effort || undefined,
      dueDate: form.dueDate || undefined,
      agentReady: form.agentReady
    }

    setSubmitting(true)
    setError(null)
    const previousIds = new Set(
      (useAppStore.getState().snapshot?.data.requirements ?? []).map((item) => item.id)
    )
    try {
      const api = requireApi()
      const snapshot = requirement
        ? await api.updateRequirement(requirement.id, draft)
        : await api.createRequirement(draft)
      applySnapshot(snapshot)
      const saved = requirement
        ? snapshot.data.requirements.find((item) => item.id === requirement.id)
        : snapshot.data.requirements.find((item) => !previousIds.has(item.id))
      if (saved) onSaved?.(saved)
      onOpenChange(false)
    } catch (submitError) {
      setError(describeError(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content requirement-dialog"
          onEscapeKeyDown={(event) => {
            if (submitting) event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (submitting) event.preventDefault()
          }}
          aria-describedby={undefined}
        >
          <header className="dialog-header">
            <div>
              <p className="eyebrow">{isEdit ? 'EDIT REQUIREMENT' : 'NEW REQUIREMENT'}</p>
              <Dialog.Title className="dialog-title">
                {isEdit ? '编辑需求' : '记下一条需求'}
              </Dialog.Title>
              <Dialog.Description className="dialog-description">
                {isEdit
                  ? '修改会立即写入本地 board.json，并出现在活动记录中。'
                  : '先写清楚要解决的问题，再决定它该如何被 Agent 分析。'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-btn icon-btn-md" aria-label="关闭">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <form className="requirement-form" onSubmit={handleSubmit} noValidate>
            {error ? (
              <div className="form-error-banner" role="alert">
                {error}
              </div>
            ) : null}

            <div className="form-field form-field-full">
              <div className="field-label-row">
                <label htmlFor={titleId}>
                  标题 <span className="required-mark">必需</span>
                </label>
                <span className="field-count">{form.title.length}/160</span>
              </div>
              <input
                ref={titleRef}
                id={titleId}
                className="text-input text-input-lg"
                value={form.title}
                maxLength={160}
                placeholder="一句话说清要解决什么，例如：支持从旧版 JSON 导入需求"
                onChange={(event) => update('title', event.target.value)}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? titleErrorId : undefined}
              />
              {fieldError ? (
                <p id={titleErrorId} className="field-error" role="alert">
                  {fieldError}
                </p>
              ) : null}
            </div>

            <div className="form-grid-2">
              <div className="form-field form-field-full">
                <div className="field-label-row">
                  <label htmlFor={descriptionId}>需求说明</label>
                  <span className="field-hint">支持 Markdown</span>
                </div>
                <textarea
                  id={descriptionId}
                  className="text-area"
                  rows={5}
                  maxLength={40_000}
                  value={form.description}
                  placeholder="背景、目标、边界、已知约束。写给未来的自己和 Agent 看。"
                  onChange={(event) => update('description', event.target.value)}
                />
              </div>
              <div className="form-field form-field-full">
                <div className="field-label-row">
                  <label htmlFor={acceptanceId}>验收标准</label>
                  <span className="field-hint">可验证的完成条件</span>
                </div>
                <textarea
                  id={acceptanceId}
                  className="text-area"
                  rows={4}
                  maxLength={40_000}
                  value={form.acceptanceCriteria}
                  placeholder="- 导入后数据完整\n- 冲突时给出明确提示\n- 原有数据不被覆盖"
                  onChange={(event) => update('acceptanceCriteria', event.target.value)}
                />
              </div>
            </div>

            <div className="form-grid-3">
              <div className="form-field">
                <label htmlFor={`${titleId}-status`}>当前阶段</label>
                <select
                  id={`${titleId}-status`}
                  className="select-input"
                  value={form.status}
                  onChange={(event) => update('status', event.target.value as RequirementStatus)}
                >
                  {STATUS_META.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label} · {status.description}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor={`${titleId}-priority`}>优先级</label>
                <select
                  id={`${titleId}-priority`}
                  className="select-input"
                  value={form.priority}
                  onChange={(event) => update('priority', event.target.value as Priority)}
                >
                  {PRIORITY_META.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.code} · {priority.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor={`${titleId}-effort`}>预估工作量</label>
                <select
                  id={`${titleId}-effort`}
                  className="select-input"
                  value={form.effort}
                  onChange={(event) => update('effort', event.target.value)}
                >
                  <option value="">未估算</option>
                  <option value="XS">XS · 一天内</option>
                  <option value="S">S · 1–3 天</option>
                  <option value="M">M · 一周内</option>
                  <option value="L">L · 2–3 周</option>
                  <option value="XL">XL · 更久</option>
                </select>
              </div>
            </div>

            <div className="form-grid-2">
              <div className="form-field">
                <div className="field-label-row">
                  <label htmlFor={`${titleId}-tags`}>标签</label>
                  <span className="field-hint">逗号分隔，最多 8 个</span>
                </div>
                <input
                  id={`${titleId}-tags`}
                  className="text-input"
                  value={form.tags}
                  placeholder="桌面端, Agent, 导入"
                  onChange={(event) => update('tags', event.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`${titleId}-source`}>来源</label>
                <input
                  id={`${titleId}-source`}
                  className="text-input"
                  value={form.source}
                  maxLength={120}
                  placeholder="用户反馈 / 内部讨论 / 自我观察"
                  onChange={(event) => update('source', event.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`${titleId}-due`}>期望日期</label>
                <input
                  id={`${titleId}-due`}
                  type="date"
                  className="text-input"
                  value={form.dueDate}
                  onChange={(event) => update('dueDate', event.target.value)}
                />
              </div>
            </div>

            <div className="form-switch-row">
              <div>
                <p className="switch-title">开放给 Agent 分析</p>
                <p className="switch-description">
                  开启后 Agent 可以领取、写分析并评论；采纳与关键字段仍由你决定。
                </p>
              </div>
              <Switch
                checked={form.agentReady}
                onChange={(next) => update('agentReady', next)}
                label="开放给 Agent 分析"
              />
            </div>

            <footer className="dialog-actions dialog-actions-sticky">
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                取消
              </Button>
              <Button type="submit" variant="primary" loading={submitting}>
                {isEdit ? '保存修改' : '创建需求'}
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
