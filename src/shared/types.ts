export const APP_NAME = 'Requirement Pulse'
export const APP_DISPLAY_NAME = '需求脉冲'
export const APP_VERSION = '0.1.0'
export const GITHUB_URL = 'https://github.com/harveyxiacn/requirement-pulse'
export const DEFAULT_BRIDGE_PORT = 47321
export const MAX_ACTIVITIES = 1000
export const SNAPSHOT_ACTIVITY_LIMIT = 200
export const API_VERSION = 'v1'

export type RequirementStatus = 'inbox' | 'planned' | 'building' | 'review' | 'done'
export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type AnalysisRecommendation = 'proceed' | 'needs-info' | 'defer' | 'decline'
export type ActorKind = 'human' | 'agent' | 'system'
export type ThemeSetting = 'system' | 'light' | 'dark'

export interface StatusMeta {
  value: RequirementStatus
  label: string
  description: string
  short: string
}

export const STATUS_META: StatusMeta[] = [
  { value: 'inbox', label: '收件箱', short: '收件箱', description: '还没判断是否要做' },
  { value: 'planned', label: '已规划', short: '已规划', description: '方向已定，尚未启动' },
  { value: 'building', label: '进行中', short: '进行中', description: '正在实现或验证' },
  { value: 'review', label: '待验收', short: '待验收', description: '等待人工验收或决策' },
  { value: 'done', label: '已完成', short: '已完成', description: '已经落地' }
]

export const STATUS_ORDER: RequirementStatus[] = STATUS_META.map((item) => item.value)

export interface PriorityMeta {
  value: Priority
  code: string
  label: string
  description: string
  rank: number
}

export const PRIORITY_META: PriorityMeta[] = [
  { value: 'critical', code: 'P0', label: '紧急', description: '阻塞或高风险，需要尽快判断', rank: 0 },
  { value: 'high', code: 'P1', label: '高', description: '重要，当前周期优先', rank: 1 },
  { value: 'medium', code: 'P2', label: '中', description: '正常排队', rank: 2 },
  { value: 'low', code: 'P3', label: '低', description: '可等待，适合作为空隙任务', rank: 3 }
]

export interface RecommendationMeta {
  value: AnalysisRecommendation
  label: string
  description: string
}

export const RECOMMENDATION_META: RecommendationMeta[] = [
  { value: 'proceed', label: '推进', description: '建议做，并可给出方案' },
  { value: 'needs-info', label: '补充信息', description: '信息不足，需要先回答开放问题' },
  { value: 'defer', label: '暂缓', description: '可做，但不建议现在做' },
  { value: 'decline', label: '不建议', description: '与目标冲突或收益不足' }
]

export const EFFORT_LABELS: Record<string, string> = {
  XS: 'XS · 一天内',
  S: 'S · 1–3 天',
  M: 'M · 一周内',
  L: 'L · 2–3 周',
  XL: 'XL · 更久'
}

export const KNOWN_AGENT_KINDS = ['claude-code', 'codex', 'deepseek', 'generic'] as const
export type KnownAgentKind = (typeof KNOWN_AGENT_KINDS)[number]

export const AGENT_KIND_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  deepseek: 'DeepSeek',
  generic: 'Agent'
}

export interface AgentRef {
  name: string
  kind: KnownAgentKind | string
  model?: string
}

export interface Actor {
  kind: ActorKind
  name: string
  agentKind?: string
  model?: string
}

export interface Claim {
  agent: AgentRef
  claimedAt: string
  expiresAt: string
}

export interface Analysis {
  id: string
  agent: AgentRef
  summary: string
  recommendation: AnalysisRecommendation
  confidence?: number
  estimatedEffort?: string
  proposedSteps: string[]
  risks: string[]
  openQuestions: string[]
  notes?: string
  createdAt: string
  idempotencyKey?: string
}

export interface Comment {
  id: string
  author: Actor
  body: string
  createdAt: string
  idempotencyKey?: string
}

export interface Requirement {
  id: string
  code: string
  title: string
  description: string
  acceptanceCriteria: string
  status: RequirementStatus
  priority: Priority
  tags: string[]
  source?: string
  effort?: string
  dueDate?: string
  agentReady: boolean
  claim: Claim | null
  order: number
  analyses: Analysis[]
  comments: Comment[]
  acceptedAnalysisId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type ActivityType =
  | 'requirement.created'
  | 'requirement.updated'
  | 'requirement.status_changed'
  | 'requirement.deleted'
  | 'requirement.agent_ready_changed'
  | 'analysis.submitted'
  | 'analysis.accepted'
  | 'analysis.unaccepted'
  | 'comment.added'
  | 'claim.created'
  | 'claim.released'
  | 'claim.expired'
  | 'bridge.started'
  | 'bridge.stopped'
  | 'data.exported'
  | 'data.imported'

export interface Activity {
  id: string
  type: ActivityType
  actor: Actor
  requirementId?: string
  requirementCode?: string
  message: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface AgentRecord {
  key: string
  name: string
  kind: string
  model?: string
  firstSeenAt: string
  lastSeenAt: string
  analysisCount: number
  commentCount: number
}

export interface AppSettings {
  theme: ThemeSetting
  userName: string
  bridgePort: number
  bridgeEnabled: boolean
  allowAgentStatusUpdates: boolean
  notifyOnAgentAnalysis: boolean
  seeded: boolean
}

export interface PersistedSettings extends AppSettings {
  bridgeToken: string
}

export interface BridgeInfo {
  running: boolean
  starting: boolean
  port: number
  url: string
  token: string
  mcpServerPath: string
  mcpServerReady: boolean
  error?: string
}

export interface AppPaths {
  userData: string
  boardFile: string
  backupsDir: string
}

export interface AppInfo {
  version: string
  platform: string
  isPackaged: boolean
}

export interface WorkspaceData {
  requirements: Requirement[]
  activities: Activity[]
  agents: AgentRecord[]
  settings: AppSettings
}

export interface AppSnapshot {
  data: WorkspaceData
  bridge: BridgeInfo
  paths: AppPaths
  app: AppInfo
  startupNotice?: string
}

export interface RequirementDraft {
  title: string
  description: string
  acceptanceCriteria: string
  status: RequirementStatus
  priority: Priority
  tags: string[]
  source?: string
  effort?: string
  dueDate?: string
  agentReady: boolean
}

export type RequirementPatch = Partial<RequirementDraft>

export interface MoveRequirementInput {
  id: string
  status: RequirementStatus
  index: number
}

export interface AddCommentInput {
  requirementId: string
  body: string
}

export interface AcceptAnalysisInput {
  requirementId: string
  analysisId: string | null
}

export interface AnalysisSubmission {
  summary: string
  recommendation: AnalysisRecommendation
  confidence?: number
  estimatedEffort?: string
  proposedSteps: string[]
  risks: string[]
  openQuestions: string[]
  notes?: string
}

export interface SettingsPatch {
  theme?: ThemeSetting
  userName?: string
  bridgePort?: number
  bridgeEnabled?: boolean
  allowAgentStatusUpdates?: boolean
  notifyOnAgentAnalysis?: boolean
}

export interface RequirementSummary {
  id: string
  code: string
  title: string
  status: RequirementStatus
  priority: Priority
  tags: string[]
  agentReady: boolean
  claim: Claim | null
  analysisCount: number
  acceptedAnalysisId: string | null
  updatedAt: string
  dueDate?: string
}

export interface BoardSummary {
  total: number
  open: number
  byStatus: Record<RequirementStatus, number>
  agentReady: number
  activeClaims: number
  awaitingReview: number
  agents: AgentRecord[]
}

export interface ExportPayload {
  kind: 'requirement-pulse-export'
  formatVersion: 1
  exportedAt: string
  data: {
    requirements: Requirement[]
    activities: Activity[]
    agents: AgentRecord[]
    settings: Pick<AppSettings, 'theme' | 'userName' | 'allowAgentStatusUpdates' | 'notifyOnAgentAnalysis'>
  }
}

export interface ExportDialogResult {
  canceled: boolean
  filePath?: string
}

export interface ImportDialogResult {
  canceled: boolean
}

export interface ApiErrorShape {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface IpcResult<T> {
  ok: boolean
  value?: T
  error?: ApiErrorShape
}

export interface PulseApi {
  getSnapshot(): Promise<AppSnapshot>
  onSnapshot(listener: (snapshot: AppSnapshot) => void): () => void
  onNavigate(listener: (path: string) => void): () => void
  createRequirement(input: RequirementDraft): Promise<AppSnapshot>
  updateRequirement(id: string, patch: RequirementPatch): Promise<AppSnapshot>
  moveRequirement(input: MoveRequirementInput): Promise<AppSnapshot>
  deleteRequirement(id: string): Promise<AppSnapshot>
  addComment(input: AddCommentInput): Promise<AppSnapshot>
  acceptAnalysis(input: AcceptAnalysisInput): Promise<AppSnapshot>
  updateSettings(patch: SettingsPatch): Promise<AppSnapshot>
  restartBridge(): Promise<AppSnapshot>
  rotateBridgeToken(): Promise<AppSnapshot>
  exportData(): Promise<ExportDialogResult>
  importData(): Promise<ImportDialogResult>
  openDataFolder(): Promise<void>
  writeClipboard(text: string): Promise<void>
  openExternal(url: string): Promise<void>
  window: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<void>
    close(): Promise<void>
    onMaximizedChange(listener: (maximized: boolean) => void): () => void
  }
}

export function getStatusMeta(status: RequirementStatus): StatusMeta {
  return STATUS_META.find((item) => item.value === status) ?? STATUS_META[0]
}

export function getPriorityMeta(priority: Priority): PriorityMeta {
  return PRIORITY_META.find((item) => item.value === priority) ?? PRIORITY_META[2]
}

export function getRecommendationMeta(recommendation: AnalysisRecommendation): RecommendationMeta {
  return (
    RECOMMENDATION_META.find((item) => item.value === recommendation) ?? RECOMMENDATION_META[1]
  )
}

export function agentKey(agent: Pick<AgentRef, 'name' | 'kind'>): string {
  return `${agent.kind}:${agent.name}`.trim().toLowerCase()
}

export function isClaimActive(claim: Claim | null | undefined, now = Date.now()): boolean {
  if (!claim) return false
  return Date.parse(claim.expiresAt) > now
}

export function toActor(agent: AgentRef): Actor {
  return { kind: 'agent', name: agent.name, agentKind: agent.kind, model: agent.model }
}

export function priorityRank(priority: Priority): number {
  return getPriorityMeta(priority).rank
}
