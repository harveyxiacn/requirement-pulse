import { EventEmitter } from 'node:events'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  AGENT_KIND_LABELS,
  MAX_ACTIVITIES,
  SNAPSHOT_ACTIVITY_LIMIT,
  STATUS_ORDER,
  agentKey,
  getRecommendationMeta,
  getStatusMeta,
  isClaimActive,
  priorityRank,
  toActor
} from '@shared/types'
import type {
  Actor,
  Activity,
  AgentRef,
  Analysis,
  AnalysisSubmission,
  AppSettings,
  BoardSummary,
  Claim,
  Comment,
  ExportPayload,
  MoveRequirementInput,
  Priority,
  Requirement,
  RequirementDraft,
  RequirementPatch,
  RequirementStatus,
  RequirementSummary,
  SettingsPatch,
  WorkspaceData
} from '@shared/types'
import { BoardError } from './errors'
import {
  boardDataSchema,
  exportPayloadSchema,
  requirementDraftSchema,
  settingsPatchSchema,
  type BoardData
} from './schemas'
import { createSeedWorkspace } from './seed'
import type { JsonBoardStore, StorePaths } from './store'

export interface AnalysisResult {
  analysis: Analysis
  requirement: Requirement
}

export interface ClaimResult {
  claim: Claim
  requirement: Requirement
}

export interface OpenedBoardService {
  service: BoardService
  startupNotice?: string
}

const SYSTEM_ACTOR: Actor = { kind: 'system', name: '系统' }
const PAGE_ORDER: RequirementStatus[] = STATUS_ORDER

export class BoardService extends EventEmitter {
  private state: BoardData
  private store: JsonBoardStore
  private startupNotice?: string

  constructor(store: JsonBoardStore, state: BoardData, startupNotice?: string) {
    super()
    this.store = store
    this.state = state
    this.startupNotice = startupNotice
  }

  static async open(store: JsonBoardStore): Promise<BoardService> {
    const read = await store.readBoardFile()
    let state: BoardData | undefined
    let startupNotice: string | undefined

    if (read.exists && read.raw !== null) {
      const parsed = boardDataSchema.safeParse(read.raw)
      if (parsed.success) {
        state = normalizeLoadedState(parsed.data)
      } else {
        const corruptPath = await store.quarantineBoardFile()
        startupNotice = `数据文件无法读取，已隔离到备份目录。${
          corruptPath ? '请从备份或导出文件恢复。' : ''
        }`
      }
    } else if (read.exists) {
      const corruptPath = await store.quarantineBoardFile()
      startupNotice = `数据文件已损坏（${read.parseError ?? 'JSON 解析失败'}），已隔离到 ${
        corruptPath ?? '备份目录'
      }。`
    }

    const isFresh = !state
    if (!state) state = createInitialState(isFresh ? !read.exists : false)
    const service = new BoardService(store, state, startupNotice)
    if (!read.exists || startupNotice) {
      await store.save(state)
      await store.backupCurrentFile(true)
    }
    return service
  }

  getStartupNotice(): string | undefined {
    return this.startupNotice
  }

  getStorePaths(): StorePaths {
    return this.store.getPaths()
  }

  getWorkspaceData(): WorkspaceData {
    return {
      requirements: structuredClone(this.state.requirements),
      activities: structuredClone(
        this.state.activities.slice(0, SNAPSHOT_ACTIVITY_LIMIT)
      ),
      agents: structuredClone(this.state.agents),
      settings: this.getPublicSettings()
    }
  }

  getPublicSettings(): AppSettings {
    const { bridgeToken: _bridgeToken, ...publicSettings } = this.state.settings
    return { ...publicSettings }
  }

  getBridgeToken(): string {
    return this.state.settings.bridgeToken
  }

  getBoardSummary(): BoardSummary {
    const byStatus = Object.fromEntries(
      PAGE_ORDER.map((status) => [status, 0])
    ) as Record<RequirementStatus, number>
    let activeClaims = 0
    let agentReady = 0
    let awaitingReview = 0
    const now = Date.now()

    for (const requirement of this.state.requirements) {
      byStatus[requirement.status] += 1
      if (requirement.agentReady) agentReady += 1
      if (isClaimActive(requirement.claim, now)) activeClaims += 1
      if (requirement.status === 'review') awaitingReview += 1
    }

    return {
      total: this.state.requirements.length,
      open: this.state.requirements.filter((item) => item.status !== 'done').length,
      byStatus,
      agentReady,
      activeClaims,
      awaitingReview,
      agents: structuredClone(
        [...this.state.agents].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      )
    }
  }

  getRequirement(idOrCode: string): Requirement {
    const requirement = this.findRequirement(idOrCode)
    if (!requirement) {
      throw new BoardError('NOT_FOUND', '需求不存在', 404)
    }
    return structuredClone(requirement)
  }

  listRequirementSummaries(filters: {
    status?: RequirementStatus
    priority?: Priority
    agentReady?: boolean
    q?: string
    limit?: number
    updatedSince?: string
    sort?: 'updated' | 'priority' | 'code'
  } = {}): RequirementSummary[] {
    const query = filters.q?.trim().toLowerCase()
    const now = Date.now()
    let list = this.state.requirements.filter((requirement) => {
      if (filters.status && requirement.status !== filters.status) return false
      if (filters.priority && requirement.priority !== filters.priority) return false
      if (
        filters.agentReady !== undefined &&
        requirement.agentReady !== filters.agentReady
      ) {
        return false
      }
      if (filters.updatedSince && requirement.updatedAt <= filters.updatedSince) {
        return false
      }
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

    const sort = filters.sort ?? 'updated'
    list = [...list].sort((a, b) => {
      if (sort === 'priority') {
        return priorityRank(a.priority) - priorityRank(b.priority)
      }
      if (sort === 'code') return a.code.localeCompare(b.code)
      return b.updatedAt.localeCompare(a.updatedAt)
    })

    const limit = Math.max(1, Math.min(filters.limit ?? 50, 200))
    return list.slice(0, limit).map((requirement) => ({
      id: requirement.id,
      code: requirement.code,
      title: requirement.title,
      status: requirement.status,
      priority: requirement.priority,
      tags: [...requirement.tags],
      agentReady: requirement.agentReady,
      claim:
        requirement.claim && isClaimActive(requirement.claim, now)
          ? structuredClone(requirement.claim)
          : null,
      analysisCount: requirement.analyses.length,
      acceptedAnalysisId: requirement.acceptedAnalysisId,
      updatedAt: requirement.updatedAt,
      dueDate: requirement.dueDate
    }))
  }

  getActivity(limit = 50): Activity[] {
    return structuredClone(this.state.activities.slice(0, Math.max(1, Math.min(limit, 200))))
  }

  async createRequirement(
    input: RequirementDraft,
    actor: Actor
  ): Promise<Requirement> {
    const draft = normalizeDraft(requirementDraftSchema.parse(input))
    const now = new Date().toISOString()

    return this.commit((state) => {
      const sequence = state.nextRequirementSequence
      state.nextRequirementSequence += 1
      const requirement: Requirement = {
        id: randomUUID(),
        code: `REQ-${String(sequence).padStart(3, '0')}`,
        title: draft.title,
        description: draft.description,
        acceptanceCriteria: draft.acceptanceCriteria,
        status: draft.status,
        priority: draft.priority,
        tags: draft.tags,
        source: draft.source,
        effort: draft.effort,
        dueDate: draft.dueDate,
        agentReady: draft.agentReady,
        claim: null,
        order: nextOrder(state, draft.status),
        analyses: [],
        comments: [],
        acceptedAnalysisId: null,
        createdBy: actor.name,
        createdAt: now,
        updatedAt: now,
        completedAt: draft.status === 'done' ? now : null
      }
      state.requirements.push(requirement)
      this.appendActivity(state, {
        type: 'requirement.created',
        actor,
        requirement,
        message: `创建了 ${requirement.code}「${requirement.title}」`
      })
      return requirement
    })
  }

  async updateRequirement(
    id: string,
    patch: RequirementPatch,
    actor: Actor
  ): Promise<Requirement> {
    const now = new Date().toISOString()
    return this.commit((state) => {
      const requirement = findInState(state, id)
      if (!requirement) throw new BoardError('NOT_FOUND', '需求不存在', 404)
      const changedFields: string[] = []
      let statusChanged = false
      let agentReadyChanged = false

      if (patch.title !== undefined) {
        const title = patch.title.trim()
        if (!title) throw new BoardError('VALIDATION_ERROR', '标题不能为空', 400)
        if (title.length > 160) {
          throw new BoardError('VALIDATION_ERROR', '标题不能超过 160 个字符', 400)
        }
        if (title !== requirement.title) {
          requirement.title = title
          changedFields.push('标题')
        }
      }
      if (patch.description !== undefined && patch.description !== requirement.description) {
        requirement.description = patch.description
        changedFields.push('描述')
      }
      if (
        patch.acceptanceCriteria !== undefined &&
        patch.acceptanceCriteria !== requirement.acceptanceCriteria
      ) {
        requirement.acceptanceCriteria = patch.acceptanceCriteria
        changedFields.push('验收标准')
      }
      if (patch.priority !== undefined && patch.priority !== requirement.priority) {
        requirement.priority = patch.priority
        changedFields.push('优先级')
      }
      if (patch.tags !== undefined) {
        const tags = sanitizeTags(patch.tags)
        if (!sameStringArray(tags, requirement.tags)) {
          requirement.tags = tags
          changedFields.push('标签')
        }
      }
      if (patch.source !== undefined) {
        const source = cleanOptional(patch.source)
        if (source !== requirement.source) {
          requirement.source = source
          changedFields.push('来源')
        }
      }
      if (patch.effort !== undefined) {
        const effort = cleanOptional(patch.effort)
        if (effort !== requirement.effort) {
          requirement.effort = effort
          changedFields.push('预估工作量')
        }
      }
      if (patch.dueDate !== undefined) {
        const dueDate = cleanOptional(patch.dueDate)
        if (dueDate !== requirement.dueDate) {
          requirement.dueDate = dueDate
          changedFields.push('截止日期')
        }
      }
      if (patch.status !== undefined && patch.status !== requirement.status) {
        const oldStatus = requirement.status
        applyStatusChange(state, requirement, patch.status, actor, now)
        placeRequirement(state, requirement, patch.status, Number.MAX_SAFE_INTEGER)
        compactOrders(state, oldStatus)
        statusChanged = true
      }
      if (patch.agentReady !== undefined && patch.agentReady !== requirement.agentReady) {
        requirement.agentReady = patch.agentReady
        agentReadyChanged = true
        if (!patch.agentReady && requirement.claim) {
          this.appendActivity(state, {
            type: 'claim.released',
            actor,
            requirement,
            message: `${requirement.code} 已关闭 Agent 协作，领取被释放`
          })
          requirement.claim = null
        }
        this.appendActivity(state, {
          type: 'requirement.agent_ready_changed',
          actor,
          requirement,
          message: `${requirement.code} ${patch.agentReady ? '已开放给 Agent' : '已关闭 Agent 协作'}`
        })
      }

      if (changedFields.length === 0 && !statusChanged && !agentReadyChanged) {
        return requirement
      }

      if (changedFields.length > 0) {
        this.appendActivity(state, {
          type: 'requirement.updated',
          actor,
          requirement,
          message: `更新了 ${requirement.code} 的${changedFields.join('、')}`,
          metadata: { fields: changedFields }
        })
      }
      requirement.updatedAt = now
      return requirement
    })
  }

  async moveRequirement(
    input: MoveRequirementInput,
    actor: Actor
  ): Promise<Requirement> {
    const now = new Date().toISOString()
    return this.commit((state) => {
      const requirement = findInState(state, input.id)
      if (!requirement) throw new BoardError('NOT_FOUND', '需求不存在', 404)
      const oldStatus = requirement.status

      if (oldStatus !== input.status) {
        applyStatusChange(state, requirement, input.status, actor, now)
      }

      placeRequirement(state, requirement, input.status, input.index)
      if (oldStatus !== input.status) {
        compactOrders(state, oldStatus)
      }
      requirement.updatedAt = now
      return requirement
    })
  }

  async deleteRequirement(id: string, actor: Actor): Promise<void> {
    const now = new Date().toISOString()
    await this.commit((state) => {
      const requirement = findInState(state, id)
      if (!requirement) throw new BoardError('NOT_FOUND', '需求不存在', 404)
      state.requirements = state.requirements.filter((item) => item.id !== requirement.id)
      this.appendActivity(state, {
        type: 'requirement.deleted',
        actor,
        requirement,
        message: `删除了 ${requirement.code}`,
        createdAt: now
      })
    })
  }

  async addComment(
    requirementId: string,
    body: string,
    actor: Actor,
    idempotencyKey?: string
  ): Promise<Comment> {
    const text = body.trim()
    if (!text) throw new BoardError('VALIDATION_ERROR', '评论不能为空', 400)
    if (text.length > 10_000) {
      throw new BoardError('VALIDATION_ERROR', '评论不能超过 10000 个字符', 400)
    }
    const now = new Date().toISOString()
    return this.commit((state) => {
      const requirement = findInState(state, requirementId)
      if (!requirement) throw new BoardError('NOT_FOUND', '需求不存在', 404)
      if (idempotencyKey) {
        const existing = requirement.comments.find(
          (comment) =>
            comment.idempotencyKey === idempotencyKey &&
            sameActor(comment.author, actor)
        )
        if (existing) return existing
        const conflict = requirement.comments.find(
          (comment) => comment.idempotencyKey === idempotencyKey
        )
        if (conflict) {
          throw new BoardError(
            'IDEMPOTENCY_CONFLICT',
            '该幂等键已被其他作者使用',
            409
          )
        }
      }
      const comment: Comment = {
        id: randomUUID(),
        author: actor,
        body: text,
        createdAt: now,
        ...(idempotencyKey ? { idempotencyKey } : {})
      }
      requirement.comments.push(comment)
      requirement.updatedAt = now
      this.touchAgent(state, actor, 'comment', now)
      this.appendActivity(state, {
        type: 'comment.added',
        actor,
        requirement,
        message: `${actor.name} 评论了 ${requirement.code}「${requirement.title}」`,
        createdAt: now
      })
      return comment
    })
  }

  async acceptAnalysis(
    requirementId: string,
    analysisId: string | null,
    actor: Actor
  ): Promise<Requirement> {
    if (actor.kind !== 'human') {
      throw new BoardError('FORBIDDEN', '只有人可以采纳分析', 403)
    }
    const now = new Date().toISOString()
    return this.commit((state) => {
      const requirement = findInState(state, requirementId)
      if (!requirement) throw new BoardError('NOT_FOUND', '需求不存在', 404)
      if (analysisId !== null) {
        const analysis = requirement.analyses.find((item) => item.id === analysisId)
        if (!analysis) {
          throw new BoardError('ANALYSIS_NOT_FOUND', '分析不存在', 404)
        }
        if (requirement.acceptedAnalysisId === analysisId) return requirement
        requirement.acceptedAnalysisId = analysisId
        requirement.updatedAt = now
        this.appendActivity(state, {
          type: 'analysis.accepted',
          actor,
          requirement,
          message: `${actor.name} 采纳了 ${analysis.agent.name} 对 ${requirement.code} 的分析`
        })
        return requirement
      }
      if (requirement.acceptedAnalysisId === null) return requirement
      requirement.acceptedAnalysisId = null
      requirement.updatedAt = now
      this.appendActivity(state, {
        type: 'analysis.unaccepted',
        actor,
        requirement,
        message: `${actor.name} 取消采纳了 ${requirement.code} 的分析`
      })
      return requirement
    })
  }

  async claimRequirement(
    id: string,
    agent: AgentRef,
    ttlMinutes = 90
  ): Promise<ClaimResult> {
    if (ttlMinutes < 15 || ttlMinutes > 240) {
      throw new BoardError('VALIDATION_ERROR', '领取时长应为 15–240 分钟', 400)
    }
    const now = new Date()
    const nowIso = now.toISOString()
    return this.commit((state) => {
      const requirement = findInState(state, id)
      if (!requirement) throw new BoardError('NOT_FOUND', '需求不存在', 404)
      if (!requirement.agentReady) {
        throw new BoardError('AGENT_NOT_READY', '该需求尚未开放给 Agent', 409)
      }
      if (requirement.status === 'done') {
        throw new BoardError('REQUIREMENT_DONE', '已完成的需求不能再领取', 409)
      }
      this.settleExpiredClaim(state, requirement, nowIso)
      const current = requirement.claim
      if (current && isClaimActive(current, now.getTime())) {
        if (agentKey(current.agent) !== agentKey(agent)) {
          throw new BoardError(
            'CLAIM_CONFLICT',
            `需求已被 ${current.agent.name} 领取`,
            409,
            { claimedBy: current.agent.name, expiresAt: current.expiresAt }
          )
        }
        current.expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString()
        current.agent = agent
        requirement.updatedAt = nowIso
        this.touchAgent(state, toActor(agent), 'presence', nowIso)
        this.appendActivity(state, {
          type: 'claim.created',
          actor: toActor(agent),
          requirement,
          message: `${agent.name} 更新了 ${requirement.code} 的领取，剩余 ${ttlMinutes} 分钟`,
          metadata: { ttlMinutes, refreshed: true },
          createdAt: nowIso
        })
        return { claim: structuredClone(current), requirement }
      }
      const claim: Claim = {
        agent,
        claimedAt: nowIso,
        expiresAt: new Date(now.getTime() + ttlMinutes * 60_000).toISOString()
      }
      requirement.claim = claim
      requirement.updatedAt = nowIso
      this.touchAgent(state, toActor(agent), 'presence', nowIso)
      this.appendActivity(state, {
        type: 'claim.created',
        actor: toActor(agent),
        requirement,
        message: `${agent.name} 领取了 ${requirement.code}，本次领取 ${ttlMinutes} 分钟`,
        metadata: { ttlMinutes },
        createdAt: nowIso
      })
      return { claim: structuredClone(claim), requirement }
    })
  }

  async releaseClaim(
    id: string,
    actor: Actor
  ): Promise<Requirement> {
    const nowIso = new Date().toISOString()
    return this.commit((state) => {
      const requirement = findInState(state, id)
      if (!requirement) throw new BoardError('NOT_FOUND', '需求不存在', 404)
      this.settleExpiredClaim(state, requirement, nowIso)
      if (!requirement.claim || !isClaimActive(requirement.claim)) {
        requirement.claim = null
        return requirement
      }
      const isOwner =
        actor.kind === 'agent' &&
        agentKey({ name: actor.name, kind: actor.agentKind ?? 'generic' }) ===
          agentKey(requirement.claim.agent)
      if (!isOwner && actor.kind !== 'human') {
        throw new BoardError(
          'FORBIDDEN',
          `需求由 ${requirement.claim.agent.name} 领取，不能由 ${actor.name} 释放`,
          403
        )
      }
      const agentName = requirement.claim.agent.name
      requirement.claim = null
      requirement.updatedAt = nowIso
      this.appendActivity(state, {
        type: 'claim.released',
        actor,
        requirement,
        message: `${actor.name} 释放了 ${requirement.code}（原领取者：${agentName}）`,
        createdAt: nowIso
      })
      return requirement
    })
  }

  async submitAnalysis(
    requirementId: string,
    submission: AnalysisSubmission,
    agent: AgentRef,
    idempotencyKey?: string
  ): Promise<AnalysisResult> {
    const now = new Date()
    const nowIso = now.toISOString()
    const normalized = normalizeSubmission(submission)
    const result = await this.commit((state) => {
      const requirement = findInState(state, requirementId)
      if (!requirement) throw new BoardError('NOT_FOUND', '需求不存在', 404)
      if (!requirement.agentReady) {
        throw new BoardError('AGENT_NOT_READY', '该需求尚未开放给 Agent', 409)
      }
      if (requirement.status === 'done') {
        throw new BoardError('REQUIREMENT_DONE', '已完成的需求不能再提交分析', 409)
      }

      if (idempotencyKey) {
        const existing = requirement.analyses.find(
          (analysis) =>
            analysis.idempotencyKey === idempotencyKey &&
            agentKey(analysis.agent) === agentKey(agent)
        )
        if (existing) return { analysis: existing, requirement }
        const conflict = requirement.analyses.find(
          (analysis) => analysis.idempotencyKey === idempotencyKey
        )
        if (conflict) {
          throw new BoardError(
            'IDEMPOTENCY_CONFLICT',
            '该幂等键已被其他 Agent 使用',
            409
          )
        }
      }

      this.settleExpiredClaim(state, requirement, nowIso)
      if (requirement.claim && isClaimActive(requirement.claim, now.getTime())) {
        if (agentKey(requirement.claim.agent) !== agentKey(agent)) {
          throw new BoardError(
            'CLAIM_CONFLICT',
            `需求已被 ${requirement.claim.agent.name} 领取`,
            409,
            {
              claimedBy: requirement.claim.agent.name,
              expiresAt: requirement.claim.expiresAt
            }
          )
        }
      } else {
        requirement.claim = {
          agent,
          claimedAt: nowIso,
          expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString()
        }
        this.appendActivity(state, {
          type: 'claim.created',
          actor: toActor(agent),
          requirement,
          message: `${agent.name} 自动领取了 ${requirement.code} 以提交分析（30 分钟）`,
          metadata: { ttlMinutes: 30, automatic: true },
          createdAt: nowIso
        })
      }

      const analysis: Analysis = {
        id: randomUUID(),
        agent,
        summary: normalized.summary,
        recommendation: normalized.recommendation,
        confidence: normalized.confidence,
        estimatedEffort: normalized.estimatedEffort,
        proposedSteps: normalized.proposedSteps,
        risks: normalized.risks,
        openQuestions: normalized.openQuestions,
        notes: normalized.notes,
        createdAt: nowIso,
        ...(idempotencyKey ? { idempotencyKey } : {})
      }
      requirement.analyses.push(analysis)
      requirement.updatedAt = nowIso
      this.touchAgent(state, toActor(agent), 'analysis', nowIso)
      this.appendActivity(state, {
        type: 'analysis.submitted',
        actor: toActor(agent),
        requirement,
        message: `${agent.name} 提交了对 ${requirement.code} 的分析：${
          getRecommendationMeta(analysis.recommendation).label
        }`,
        metadata: {
          analysisId: analysis.id,
          recommendation: analysis.recommendation,
          confidence: analysis.confidence
        },
        createdAt: nowIso
      })
      return { analysis, requirement }
    })

    this.emit('analysis:created', {
      analysis: structuredClone(result.analysis),
      requirement: structuredClone(result.requirement)
    })
    return result
  }

  async updateStatusByAgent(
    requirementId: string,
    status: RequirementStatus,
    agent: AgentRef
  ): Promise<Requirement> {
    if (!this.state.settings.allowAgentStatusUpdates) {
      throw new BoardError(
        'AGENT_UPDATES_DISABLED',
        '设置中已禁止 Agent 修改需求状态',
        403
      )
    }
    const now = new Date()
    const nowIso = now.toISOString()
    return this.commit((state) => {
      const requirement = findInState(state, requirementId)
      if (!requirement) throw new BoardError('NOT_FOUND', '需求不存在', 404)
      if (!requirement.agentReady) {
        throw new BoardError('AGENT_NOT_READY', '该需求尚未开放给 Agent', 409)
      }
      if (requirement.status === 'done' && status !== 'done') {
        throw new BoardError(
          'REQUIREMENT_DONE',
          'Agent 不能将已完成需求移回其他状态',
          409
        )
      }
      if (requirement.claim && isClaimActive(requirement.claim, now.getTime())) {
        if (agentKey(requirement.claim.agent) !== agentKey(agent)) {
          throw new BoardError(
            'CLAIM_CONFLICT',
            `需求已被 ${requirement.claim.agent.name} 领取`,
            409
          )
        }
      }
      this.settleExpiredClaim(state, requirement, nowIso)
      if (requirement.status === status) return requirement
      const oldStatus = requirement.status
      applyStatusChange(state, requirement, status, toActor(agent), nowIso)
      placeRequirement(state, requirement, status, Number.MAX_SAFE_INTEGER)
      compactOrders(state, oldStatus)
      requirement.updatedAt = nowIso
      return requirement
    })
  }

  async updateSettings(patch: SettingsPatch): Promise<AppSettings> {
    const parsed = settingsPatchSchema.parse(patch)
    const hasChanges = Object.keys(parsed).length > 0
    if (!hasChanges) return this.getPublicSettings()
    await this.commit((state) => {
      for (const [key, value] of Object.entries(parsed)) {
        if (value === undefined) continue
        if (key === 'userName' && typeof value === 'string') {
          state.settings.userName = value.trim()
        } else {
          ;(state.settings as unknown as Record<string, unknown>)[key] = value
        }
      }
    })
    return this.getPublicSettings()
  }

  async rotateBridgeToken(): Promise<string> {
    const token = generateToken()
    await this.commit((state) => {
      state.settings.bridgeToken = token
    })
    return token
  }

  exportData(): ExportPayload {
    return {
      kind: 'requirement-pulse-export',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        requirements: structuredClone(this.state.requirements),
        activities: structuredClone(this.state.activities),
        agents: structuredClone(this.state.agents),
        settings: {
          theme: this.state.settings.theme,
          userName: this.state.settings.userName,
          allowAgentStatusUpdates: this.state.settings.allowAgentStatusUpdates,
          notifyOnAgentAnalysis: this.state.settings.notifyOnAgentAnalysis
        }
      }
    }
  }

  async recordExported(): Promise<void> {
    const now = new Date().toISOString()
    await this.commit((state) => {
      this.appendActivity(state, {
        type: 'data.exported',
        actor: { kind: 'human', name: state.settings.userName },
        message: '导出了工作区数据',
        createdAt: now
      })
    })
  }

  async importData(raw: unknown): Promise<void> {
    const parsed = exportPayloadSchema.safeParse(raw)
    if (!parsed.success) {
      throw new BoardError('IMPORT_INVALID', '导入文件不符合 Requirement Pulse 导出格式', 400, {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      })
    }
    const payload = parsed.data
    await this.store.backupCurrentFile(true)

    const now = new Date().toISOString()
    const nextState: BoardData = {
      schemaVersion: 1,
      createdAt: this.state.createdAt,
      updatedAt: now,
      nextRequirementSequence: deriveNextSequence(payload.data.requirements),
      requirements: structuredClone(payload.data.requirements),
      activities: structuredClone(payload.data.activities).slice(0, MAX_ACTIVITIES),
      agents: structuredClone(payload.data.agents),
      settings: {
        ...this.state.settings,
        theme: payload.data.settings.theme,
        userName: payload.data.settings.userName,
        allowAgentStatusUpdates: payload.data.settings.allowAgentStatusUpdates,
        notifyOnAgentAnalysis: payload.data.settings.notifyOnAgentAnalysis,
        seeded: true
      }
    }

    normalizeRequirementCollection(nextState)
    const importActivity = {
      id: randomUUID(),
      type: 'data.imported' as const,
      actor: { kind: 'human' as const, name: nextState.settings.userName },
      message: `导入了 ${nextState.requirements.length} 条需求`,
      createdAt: now
    }
    nextState.activities.unshift(importActivity)

    await this.store.save(nextState)
    this.state = nextState
    this.emit('changed')
  }

  getBrief(idOrCode: string): string {
    const requirement = this.findRequirement(idOrCode)
    if (!requirement) throw new BoardError('NOT_FOUND', '需求不存在', 404)
    return buildRequirementBrief(requirement)
  }

  private findRequirement(idOrCode: string): Requirement | undefined {
    const normalized = idOrCode.trim()
    return this.state.requirements.find(
      (requirement) =>
        requirement.id === normalized ||
        requirement.code.toLowerCase() === normalized.toLowerCase()
    )
  }

  private async commit<T>(mutator: (draft: BoardData) => T): Promise<T> {
    const draft = structuredClone(this.state)
    const result = mutator(draft)
    draft.updatedAt = new Date().toISOString()
    draft.activities = draft.activities.slice(0, MAX_ACTIVITIES)
    await this.store.save(draft)
    this.state = draft
    this.emit('changed')
    return result
  }

  private appendActivity(
    draft: BoardData,
    input: {
      type: BoardData['activities'][number]['type']
      actor: Actor
      requirement?: Requirement
      message: string
      metadata?: Record<string, unknown>
      createdAt?: string
    }
  ): void {
    pushActivity(draft, input)
  }

  private settleExpiredClaim(
    draft: BoardData,
    requirement: Requirement,
    nowIso: string
  ): void {
    if (!requirement.claim) return
    if (isClaimActive(requirement.claim)) return
    const expiredAgent = requirement.claim.agent.name
    requirement.claim = null
    requirement.updatedAt = nowIso
    this.appendActivity(draft, {
      type: 'claim.expired',
      actor: SYSTEM_ACTOR,
      requirement,
      message: `${requirement.code} 的 Agent 领取已过期（${expiredAgent}）`,
      createdAt: nowIso
    })
  }

  private touchAgent(
    draft: BoardData,
    actor: Actor,
    action: 'analysis' | 'comment' | 'presence',
    nowIso: string
  ): void {
    if (actor.kind !== 'agent') return
    const kind = actor.agentKind ?? 'generic'
    const key = agentKey({ name: actor.name, kind })
    let record = draft.agents.find((item) => item.key === key)
    if (!record) {
      record = {
        key,
        name: actor.name,
        kind,
        model: actor.model,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        analysisCount: 0,
        commentCount: 0
      }
      draft.agents.push(record)
    }
    record.lastSeenAt = nowIso
    if (actor.model) record.model = actor.model
    if (action === 'analysis') record.analysisCount += 1
    if (action === 'comment') record.commentCount += 1
    draft.agents.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  }
}

function createInitialState(seed: boolean): BoardData {
  const now = new Date().toISOString()
  const seedWorkspace = seed ? createSeedWorkspace(new Date()) : null
  return {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    nextRequirementSequence: seedWorkspace?.nextRequirementSequence ?? 1,
    requirements: seedWorkspace?.requirements ?? [],
    activities: seedWorkspace?.activities ?? [],
    agents: seedWorkspace?.agents ?? [],
    settings: {
      theme: 'system',
      userName: '本地用户',
      bridgePort: 47321,
      bridgeEnabled: true,
      allowAgentStatusUpdates: true,
      notifyOnAgentAnalysis: true,
      seeded: seed,
      bridgeToken: generateToken()
    }
  }
}

function normalizeLoadedState(data: BoardData): BoardData {
  const state = structuredClone(data)
  normalizeRequirementCollection(state)
  state.activities = state.activities.slice(0, MAX_ACTIVITIES)
  return state
}

function normalizeRequirementCollection(state: BoardData): void {
  for (const requirement of state.requirements) {
    requirement.tags = sanitizeTags(requirement.tags)
    requirement.order = Number.isFinite(requirement.order) ? requirement.order : 0
    if (
      requirement.acceptedAnalysisId &&
      !requirement.analyses.some((analysis) => analysis.id === requirement.acceptedAnalysisId)
    ) {
      requirement.acceptedAnalysisId = null
    }
    if (requirement.claim && !isClaimActive(requirement.claim)) {
      requirement.claim = null
    }
    if (requirement.status === 'done' && !requirement.completedAt) {
      requirement.completedAt = requirement.updatedAt
    }
    if (requirement.status !== 'done') {
      requirement.completedAt = null
    }
  }
  for (const status of PAGE_ORDER) {
    const list = state.requirements
      .filter((requirement) => requirement.status === status)
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
    list.forEach((requirement, index) => {
      requirement.order = index
    })
  }
  state.nextRequirementSequence = Math.max(
    state.nextRequirementSequence,
    deriveNextSequence(state.requirements)
  )
  state.agents.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
}

function applyStatusChange(
  state: BoardData,
  requirement: Requirement,
  status: RequirementStatus,
  actor: Actor,
  nowIso: string
): void {
  const oldStatus = requirement.status
  const oldLabel = getStatusMeta(oldStatus).label
  const newLabel = getStatusMeta(status).label
  requirement.status = status
  requirement.completedAt = status === 'done' ? nowIso : null
  if (status === 'done' && requirement.claim) {
    requirement.claim = null
  }
  requirement.updatedAt = nowIso
  pushActivity(state, {
    type: 'requirement.status_changed',
    actor,
    requirement,
    message: `${requirement.code} 从「${oldLabel}」移到「${newLabel}」`,
    metadata: { from: oldStatus, to: status },
    createdAt: nowIso
  })
}

function placeRequirement(
  state: BoardData,
  requirement: Requirement,
  targetStatus: RequirementStatus,
  targetIndex: number
): void {
  requirement.status = targetStatus
  const list = state.requirements
    .filter((item) => item.status === targetStatus && item.id !== requirement.id)
    .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
  const index = Math.max(0, Math.min(targetIndex, list.length))
  list.splice(index, 0, requirement)
  list.forEach((item, itemIndex) => {
    item.order = itemIndex
  })
}

function compactOrders(state: BoardData, status: RequirementStatus): void {
  state.requirements
    .filter((item) => item.status === status)
    .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code))
    .forEach((item, index) => {
      item.order = index
    })
}

function nextOrder(state: BoardData, status: RequirementStatus): number {
  return state.requirements.filter((item) => item.status === status).length
}

function findInState(state: BoardData, idOrCode: string): Requirement | undefined {
  const value = idOrCode.trim()
  return state.requirements.find(
    (requirement) =>
      requirement.id === value ||
      requirement.code.toLowerCase() === value.toLowerCase()
  )
}

function deriveNextSequence(requirements: Requirement[]): number {
  const max = requirements.reduce((result, requirement) => {
    const value = Number(requirement.code.replace('REQ-', ''))
    return Number.isFinite(value) ? Math.max(result, value) : result
  }, 0)
  return max + 1
}

function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function sanitizeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const tag of tags) {
    const cleaned = tag.trim().slice(0, 32)
    if (!cleaned) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
    if (result.length >= 8) break
  }
  return result
}

function normalizeDraft(input: RequirementDraft): RequirementDraft {
  return {
    ...input,
    title: input.title.trim(),
    description: input.description ?? '',
    acceptanceCriteria: input.acceptanceCriteria ?? '',
    tags: sanitizeTags(input.tags),
    source: cleanOptional(input.source),
    effort: cleanOptional(input.effort),
    dueDate: cleanOptional(input.dueDate)
  }
}

function normalizeSubmission(input: AnalysisSubmission): AnalysisSubmission {
  const cleanList = (items: string[]): string[] =>
    items.map((item) => item.trim()).filter(Boolean).slice(0, 12)
  return {
    summary: input.summary.trim(),
    recommendation: input.recommendation,
    confidence: input.confidence,
    estimatedEffort: cleanOptional(input.estimatedEffort),
    proposedSteps: cleanList(input.proposedSteps ?? []),
    risks: cleanList(input.risks ?? []),
    openQuestions: cleanList(input.openQuestions ?? []),
    notes: cleanOptional(input.notes)
  }
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function sameActor(a: Actor, b: Actor): boolean {
  if (a.kind !== b.kind || a.name !== b.name) return false
  if (a.kind === 'agent') {
    return (a.agentKind ?? 'generic') === (b.agentKind ?? 'generic')
  }
  return true
}

function pushActivity(
  draft: BoardData,
  input: {
    type: BoardData['activities'][number]['type']
    actor: Actor
    requirement?: Requirement
    message: string
    metadata?: Record<string, unknown>
    createdAt?: string
  }
): void {
  draft.activities.unshift({
    id: randomUUID(),
    type: input.type,
    actor: input.actor,
    requirementId: input.requirement?.id,
    requirementCode: input.requirement?.code,
    message: input.message,
    metadata: input.metadata,
    createdAt: input.createdAt ?? new Date().toISOString()
  })
  draft.activities = draft.activities.slice(0, MAX_ACTIVITIES)
}

function buildRequirementBrief(requirement: Requirement): string {
  const status = getStatusMeta(requirement.status)
  const analyses = requirement.analyses.length
    ? requirement.analyses
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((analysis) => {
          const lines = [
            `### ${analysis.agent.name}（${AGENT_KIND_LABELS[analysis.agent.kind] ?? analysis.agent.kind}）· ${
              getRecommendationMeta(analysis.recommendation).label
            }${analysis.confidence !== undefined ? ` · 置信度 ${analysis.confidence}%` : ''}`,
            '',
            analysis.summary
          ]
          if (analysis.proposedSteps.length) {
            lines.push(
              '',
              '**建议步骤**',
              ...analysis.proposedSteps.map((step, index) => `${index + 1}. ${step}`)
            )
          }
          if (analysis.risks.length) {
            lines.push('', '**风险**', ...analysis.risks.map((risk) => `- ${risk}`))
          }
          if (analysis.openQuestions.length) {
            lines.push('', '**开放问题**', ...analysis.openQuestions.map((question) => `- ${question}`))
          }
          if (analysis.notes) lines.push('', analysis.notes)
          return lines.join('\n')
        })
        .join('\n\n')
    : '（暂无）'

  return `# ${requirement.code} · ${requirement.title}

状态：${status.label}　优先级：${requirement.priority}
标签：${requirement.tags.length ? requirement.tags.join('、') : '无'}
开放给 Agent：${requirement.agentReady ? '是' : '否'}
创建：${requirement.createdAt}　更新：${requirement.updatedAt}

## 需求描述

${requirement.description || '（未填写）'}

## 验收标准

${requirement.acceptanceCriteria || '（未填写）'}

## 已有分析

${analyses}

## 工作协议

1. 使用 pulse_get_requirement 读取完整需求。
2. 深度分析前先使用 pulse_claim_requirement 领取；如冲突，停止并报告。
3. 产出结构化分析：summary、recommendation、confidence、proposedSteps、risks、openQuestions、notes。
4. 使用 pulse_submit_analysis 回写，建议携带 Idempotency-Key。
5. 不要修改代码文件或替代人做采纳决定；完成后释放领取。
`
}
