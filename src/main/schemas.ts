import { z } from 'zod'
import type { ApiErrorShape } from '@shared/types'

const statusValues = ['inbox', 'planned', 'building', 'review', 'done'] as const
const priorityValues = ['critical', 'high', 'medium', 'low'] as const
const recommendationValues = ['proceed', 'needs-info', 'defer', 'decline'] as const
const actorKinds = ['human', 'agent', 'system'] as const

export const statusSchema = z.enum(statusValues)
export const prioritySchema = z.enum(priorityValues)
export const recommendationSchema = z.enum(recommendationValues)
export const actorKindSchema = z.enum(actorKinds)

export const agentRefSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.string().trim().min(1).max(40),
    model: z.string().trim().max(80).optional()
  })
  .strict()

export const actorSchema = z
  .object({
    kind: actorKindSchema,
    name: z.string().trim().min(1).max(80),
    agentKind: z.string().trim().max(40).optional(),
    model: z.string().trim().max(80).optional()
  })
  .strict()

const tagSchema = z.string().trim().min(1).max(32)

export const requirementDraftSchema = z
  .object({
    title: z.string().trim().min(1, '标题不能为空').max(160, '标题不能超过 160 个字符'),
    description: z.string().max(40_000).default(''),
    acceptanceCriteria: z.string().max(40_000).default(''),
    status: statusSchema,
    priority: prioritySchema,
    tags: z.array(tagSchema).max(8).default([]).transform((tags) => [...new Set(tags)]),
    source: z.string().trim().max(120).optional(),
    effort: z.string().trim().max(40).optional(),
    dueDate: z
      .string()
      .trim()
      .max(10)
      .regex(/^$|^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD')
      .optional(),
    agentReady: z.boolean().default(true)
  })
  .strict()

export const requirementPatchSchema = requirementDraftSchema.partial()

export const claimSchema = z.object({
  agent: agentRefSchema,
  claimedAt: z.string().datetime(),
  expiresAt: z.string().datetime()
})

export const analysisSchema = z.object({
  id: z.string().min(1),
  agent: agentRefSchema,
  summary: z.string().min(1).max(4_000),
  recommendation: recommendationSchema,
  confidence: z.number().int().min(0).max(100).optional(),
  estimatedEffort: z.string().max(40).optional(),
  proposedSteps: z.array(z.string().max(1_000)).max(12),
  risks: z.array(z.string().max(1_000)).max(12),
  openQuestions: z.array(z.string().max(1_000)).max(12),
  notes: z.string().max(20_000).optional(),
  createdAt: z.string().datetime(),
  idempotencyKey: z.string().max(120).optional()
})

export const commentSchema = z.object({
  id: z.string().min(1),
  author: actorSchema,
  body: z.string().min(1).max(10_000),
  createdAt: z.string().datetime(),
  idempotencyKey: z.string().max(120).optional()
})

export const requirementSchema = z.object({
  id: z.string().min(1),
  code: z.string().regex(/^REQ-\d{3,}$/),
  title: z.string().min(1).max(160),
  description: z.string().max(40_000),
  acceptanceCriteria: z.string().max(40_000),
  status: statusSchema,
  priority: prioritySchema,
  tags: z.array(z.string().max(32)).max(8),
  source: z.string().max(120).optional(),
  effort: z.string().max(40).optional(),
  dueDate: z.string().max(10).optional(),
  agentReady: z.boolean(),
  claim: claimSchema.nullable(),
  order: z.number().int().min(0),
  analyses: z.array(analysisSchema),
  comments: z.array(commentSchema),
  acceptedAnalysisId: z.string().nullable(),
  createdBy: z.string().min(1).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable()
})

export const activitySchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'requirement.created',
    'requirement.updated',
    'requirement.status_changed',
    'requirement.deleted',
    'requirement.agent_ready_changed',
    'analysis.submitted',
    'analysis.accepted',
    'analysis.unaccepted',
    'comment.added',
    'claim.created',
    'claim.released',
    'claim.expired',
    'bridge.started',
    'bridge.stopped',
    'data.exported',
    'data.imported'
  ]),
  actor: actorSchema,
  requirementId: z.string().optional(),
  requirementCode: z.string().optional(),
  message: z.string().min(1).max(1_000),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime()
})

export const agentRecordSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1).max(80),
  kind: z.string().min(1).max(40),
  model: z.string().max(80).optional(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  analysisCount: z.number().int().min(0),
  commentCount: z.number().int().min(0)
})

export const persistedSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  userName: z.string().trim().min(1).max(60),
  bridgePort: z.number().int().min(1024).max(65_535),
  bridgeEnabled: z.boolean(),
  allowAgentStatusUpdates: z.boolean(),
  notifyOnAgentAnalysis: z.boolean(),
  seeded: z.boolean(),
  bridgeToken: z.string().min(32)
})

export const boardDataSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  nextRequirementSequence: z.number().int().min(1),
  requirements: z.array(requirementSchema),
  activities: z.array(activitySchema).max(1_000),
  agents: z.array(agentRecordSchema),
  settings: persistedSettingsSchema
})

export const settingsPatchSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']).optional(),
    userName: z.string().trim().min(1).max(60).optional(),
    bridgePort: z.number().int().min(1024).max(65_535).optional(),
    bridgeEnabled: z.boolean().optional(),
    allowAgentStatusUpdates: z.boolean().optional(),
    notifyOnAgentAnalysis: z.boolean().optional()
  })
  .strict()

export const analysisSubmissionSchema = z
  .object({
    summary: z.string().trim().min(1, '分析摘要不能为空').max(4_000),
    recommendation: recommendationSchema,
    confidence: z.number().int().min(0).max(100).optional(),
    estimatedEffort: z.string().trim().max(40).optional(),
    proposedSteps: z.array(z.string().trim().min(1).max(1_000)).max(12).default([]),
    risks: z.array(z.string().trim().min(1).max(1_000)).max(12).default([]),
    openQuestions: z.array(z.string().trim().min(1).max(1_000)).max(12).default([]),
    notes: z.string().trim().max(20_000).optional()
  })
  .strict()

export const claimRequestSchema = z
  .object({
    agent: agentRefSchema,
    ttlMinutes: z.number().int().min(15).max(240).optional()
  })
  .strict()

export const releaseClaimRequestSchema = z.object({ agent: agentRefSchema }).strict()

export const analysisRequestSchema = z
  .object({
    agent: agentRefSchema,
    ...analysisSubmissionSchema.shape
  })
  .strict()

export const commentRequestSchema = z
  .object({
    agent: agentRefSchema,
    body: z.string().trim().min(1, '评论不能为空').max(10_000)
  })
  .strict()

export const patchRequirementRequestSchema = z
  .object({
    agent: agentRefSchema,
    status: statusSchema
  })
  .strict()

export const addCommentInputSchema = z
  .object({
    requirementId: z.string().min(1),
    body: z.string().trim().min(1).max(10_000)
  })
  .strict()

export const acceptAnalysisInputSchema = z
  .object({
    requirementId: z.string().min(1),
    analysisId: z.string().min(1).nullable()
  })
  .strict()

export const moveRequirementInputSchema = z
  .object({
    id: z.string().min(1),
    status: statusSchema,
    index: z.number().int().min(0)
  })
  .strict()

export const exportPayloadSchema = z.object({
  kind: z.literal('requirement-pulse-export'),
  formatVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  data: z.object({
    requirements: z.array(requirementSchema),
    activities: z.array(activitySchema),
    agents: z.array(agentRecordSchema),
    settings: z.object({
      theme: z.enum(['system', 'light', 'dark']),
      userName: z.string().trim().min(1).max(60),
      allowAgentStatusUpdates: z.boolean(),
      notifyOnAgentAnalysis: z.boolean()
    })
  })
})

export function formatZodError(error: z.ZodError): ApiErrorShape {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message
  }))
  const first = issues[0]
  return {
    code: 'VALIDATION_ERROR',
    message: first ? `${first.path || '请求'}：${first.message}` : '请求字段不合法',
    details: { issues }
  }
}

export type BoardData = z.infer<typeof boardDataSchema>
