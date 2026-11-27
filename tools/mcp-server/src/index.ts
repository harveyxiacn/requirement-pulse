import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

declare const __PULSE_VERSION__: string

const VERSION = __PULSE_VERSION__
const DEFAULT_URL = 'http://127.0.0.1:47321'
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

class BridgeError extends Error {
  code: string
  status?: number

  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
    this.status = status
  }
}

function resolveBaseUrl(): string {
  const raw = process.env.PULSE_BRIDGE_URL?.trim() || DEFAULT_URL
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`PULSE_BRIDGE_URL 不是合法 URL：${raw}`)
  }
  if (parsed.protocol !== 'http:') {
    throw new Error('PULSE_BRIDGE_URL 必须使用 http://；桥接只在本机回环地址提供 HTTP')
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`PULSE_BRIDGE_URL 必须指向本机回环地址，当前为 ${parsed.hostname}`)
  }
  return parsed.origin
}

const baseUrl = resolveBaseUrl()
const token = process.env.PULSE_BRIDGE_TOKEN?.trim() || ''

class BridgeClient {
  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' })
  }

  async write<T>(
    path: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body: unknown,
    idempotencyKey?: string
  ): Promise<T> {
    return this.request<T>(path, {
      method,
      body: JSON.stringify(body),
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
      }
    })
  }

  private async request<T>(
    path: string,
    init: RequestInit & { headers?: Record<string, string> }
  ): Promise<T> {
    if (!token) {
      throw new BridgeError(
        'TOKEN_MISSING',
        '缺少 PULSE_BRIDGE_TOKEN。请把 Agent 值守页的令牌写入 MCP 配置的 env。'
      )
    }
    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          'User-Agent': `requirement-pulse-mcp/${VERSION}`,
          ...init.headers
        },
        signal: AbortSignal.timeout(20_000)
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new BridgeError(
        'BRIDGE_UNREACHABLE',
        `无法连接 Requirement Pulse 本地桥接（${baseUrl}）。确认桌面应用正在运行、Agent 桥接已启用。原始错误：${reason}`
      )
    }

    const text = await response.text()
    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        throw new BridgeError(
          'INVALID_RESPONSE',
          `桥接返回了非 JSON 响应（HTTP ${response.status}）`,
          response.status
        )
      }
    }

    if (
      payload &&
      typeof payload === 'object' &&
      'ok' in payload &&
      (payload as { ok: unknown }).ok === true &&
      'data' in payload
    ) {
      return (payload as { data: T }).data
    }

    if (
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      (payload as { error?: { code?: string; message?: string } }).error
    ) {
      const apiError = (payload as { error: { code?: string; message?: string } }).error
      throw new BridgeError(
        apiError.code ?? 'BRIDGE_ERROR',
        apiError.message ?? `桥接请求失败（HTTP ${response.status}）`,
        response.status
      )
    }

    if (!response.ok) {
      throw new BridgeError(
        'BRIDGE_ERROR',
        `桥接请求失败（HTTP ${response.status}）`,
        response.status
      )
    }

    return payload as T
  }
}

const client = new BridgeClient()

const defaultAgent = {
  name: process.env.PULSE_AGENT_NAME?.trim() || 'MCP Agent',
  kind: process.env.PULSE_AGENT_KIND?.trim() || 'generic',
  ...(process.env.PULSE_AGENT_MODEL?.trim()
    ? { model: process.env.PULSE_AGENT_MODEL.trim() }
    : {})
}

type AgentInput = { name: string; kind: string; model?: string }

const agentSchema = z
  .object({
    name: z.string().trim().min(1).max(80).describe('Agent 显示名称，例如 Claude Code'),
    kind: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .describe('Agent 类型：claude-code、codex、deepseek 或 generic'),
    model: z.string().trim().max(80).optional().describe('可选模型标识，例如 claude-sonnet-5-5')
  })
  .strict()

const statusSchema = z.enum(['inbox', 'planned', 'building', 'review', 'done'])
const prioritySchema = z.enum(['critical', 'high', 'medium', 'low'])
const recommendationSchema = z.enum(['proceed', 'needs-info', 'defer', 'decline'])

function agentOrDefault(input: AgentInput | undefined): AgentInput {
  if (input) return input
  return { ...defaultAgent }
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function success(value: unknown, extra?: string): CallToolResult {
  return {
    content: [
      { type: 'text', text: jsonText(value) },
      ...(extra ? [{ type: 'text' as const, text: extra }] : [])
    ]
  }
}

function failure(error: unknown): CallToolResult {
  const code = error instanceof BridgeError ? error.code : 'MCP_ERROR'
  const message = error instanceof Error ? error.message : String(error)
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `${code}: ${message}`
      }
    ]
  }
}

async function guarded<T>(operation: () => Promise<T>, format: (value: T) => CallToolResult): Promise<CallToolResult> {
  try {
    return format(await operation())
  } catch (error) {
    return failure(error)
  }
}

const server = new McpServer({
  name: 'requirement-pulse',
  version: VERSION
})

server.registerTool(
  'pulse_board_summary',
  {
    title: '读取需求看板概览',
    description:
      '读取 Requirement Pulse 看板的总数、各阶段数量、Agent 就绪数量、活跃领取与待验收数量。适合作为进入工作区后的第一次调用。',
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async () => guarded(() => client.get('/v1/board'), success)
)

server.registerTool(
  'pulse_list_requirements',
  {
    title: '列出需求',
    description:
      '按状态、优先级、关键词或 Agent 就绪状态筛选需求摘要。返回按更新时间、优先级或编号排序的列表，不包含完整描述与分析正文。',
    inputSchema: {
      status: statusSchema.optional().describe('按阶段筛选'),
      priority: prioritySchema.optional().describe('按优先级筛选'),
      agentReady: z.boolean().optional().describe('仅看开放（true）或未开放（false）给 Agent 的需求'),
      q: z.string().trim().max(200).optional().describe('在编号、标题、描述、标签中搜索'),
      updatedSince: z.string().max(40).optional().describe('ISO 时间；只返回更新更晚的需求'),
      sort: z.enum(['updated', 'priority', 'code']).optional().describe('排序方式，默认 updated'),
      limit: z.number().int().min(1).max(200).optional().describe('最多返回条数，默认 50')
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (args) =>
    guarded(async () => {
      const params = new URLSearchParams()
      if (args.status) params.set('status', args.status)
      if (args.priority) params.set('priority', args.priority)
      if (args.agentReady !== undefined) params.set('agentReady', String(args.agentReady))
      if (args.q) params.set('q', args.q)
      if (args.updatedSince) params.set('updatedSince', args.updatedSince)
      if (args.sort) params.set('sort', args.sort)
      if (args.limit) params.set('limit', String(args.limit))
      const query = params.toString()
      const requirements = await client.get<unknown[]>(`/v1/requirements${query ? `?${query}` : ''}`)
      return { count: requirements.length, requirements }
    }, success)
)

server.registerTool(
  'pulse_get_requirement',
  {
    title: '读取完整需求',
    description:
      '通过需求 id 或编号（如 REQ-003）读取完整需求、已有分析、评论以及一段可直接使用的 Markdown 工作简报。开始分析前先调用此工具。',
    inputSchema: {
      idOrCode: z.string().trim().min(1).max(200).describe('需求 UUID 或 REQ-003 这样的编号')
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (args) =>
    guarded(async () => {
      const data = await client.get<{ requirement: unknown; briefMarkdown: string }>(
        `/v1/requirements/${encodeURIComponent(args.idOrCode)}`
      )
      return data
    }, (data) => success(data.requirement, data.briefMarkdown))
)

server.registerTool(
  'pulse_claim_requirement',
  {
    title: '领取需求',
    description:
      '声明某个 Agent 正在分析一条需求，避免并发写入。成功后会得到一个带到期时间的领取；其他 Agent 在到期前提交分析会得到冲突。若返回 CLAIM_CONFLICT，请停止并报告，不要绕过。',
    inputSchema: {
      idOrCode: z.string().trim().min(1).max(200).describe('需求 UUID 或编号'),
      ttlMinutes: z
        .number()
        .int()
        .min(15)
        .max(240)
        .optional()
        .describe('领取时长（分钟），默认 90'),
      agent: agentSchema.optional().describe('可选；未提供时使用 MCP 配置中的 PULSE_AGENT_* 环境变量')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    }
  },
  async (args) =>
    guarded(
      () =>
        client.write(
          `/v1/requirements/${encodeURIComponent(args.idOrCode)}/claim`,
          'POST',
          {
            agent: agentOrDefault(args.agent),
            ...(args.ttlMinutes ? { ttlMinutes: args.ttlMinutes } : {})
          },
          `claim-${randomUUID()}`
        ),
      success
    )
)

server.registerTool(
  'pulse_release_requirement',
  {
    title: '释放需求领取',
    description:
      '释放当前 Agent 的领取，让其他 Agent 可以接手。完成后应释放，避免需求长时间显示为分析中。',
    inputSchema: {
      idOrCode: z.string().trim().min(1).max(200).describe('需求 UUID 或编号'),
      agent: agentSchema.optional().describe('可选；未提供时使用环境变量')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (args) =>
    guarded(
      () =>
        client.write(
          `/v1/requirements/${encodeURIComponent(args.idOrCode)}/claim`,
          'DELETE',
          { agent: agentOrDefault(args.agent) }
        ),
      success
    )
)

server.registerTool(
  'pulse_submit_analysis',
  {
    title: '提交结构化分析',
    description:
      '把分析写回需求看板。必须给出摘要和建议（proceed / needs-info / defer / decline），可选置信度、工作量、步骤、风险、开放问题与备注。分析只能由人采纳；本工具不能修改需求状态或验收标准。建议提供 idempotencyKey 以安全重试。',
    inputSchema: {
      idOrCode: z.string().trim().min(1).max(200).describe('需求 UUID 或编号'),
      summary: z.string().trim().min(1).max(4000).describe('分析摘要，说明判断与理由'),
      recommendation: recommendationSchema.describe('proceed 推进；needs-info 补充信息；defer 暂缓；decline 不建议'),
      confidence: z.number().int().min(0).max(100).optional().describe('置信度 0–100'),
      estimatedEffort: z
        .enum(['XS', 'S', 'M', 'L', 'XL'])
        .optional()
        .describe('估算工作量：XS 一天内，S 1–3 天，M 一周内，L 2–3 周，XL 更久'),
      proposedSteps: z.array(z.string().trim().min(1).max(1000)).max(12).optional().describe('建议实施步骤'),
      risks: z.array(z.string().trim().min(1).max(1000)).max(12).optional().describe('风险与未知项'),
      openQuestions: z
        .array(z.string().trim().min(1).max(1000))
        .max(12)
        .optional()
        .describe('需要人回答的开放问题'),
      notes: z.string().trim().max(20_000).optional().describe('补充备注，可使用 Markdown'),
      idempotencyKey: z.string().trim().max(120).optional().describe('幂等键；重试时保持相同值'),
      agent: agentSchema.optional().describe('可选；未提供时使用环境变量')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (args) =>
    guarded(
      () =>
        client.write(
          `/v1/requirements/${encodeURIComponent(args.idOrCode)}/analyses`,
          'POST',
          {
            agent: agentOrDefault(args.agent),
            summary: args.summary,
            recommendation: args.recommendation,
            ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
            ...(args.estimatedEffort ? { estimatedEffort: args.estimatedEffort } : {}),
            proposedSteps: args.proposedSteps ?? [],
            risks: args.risks ?? [],
            openQuestions: args.openQuestions ?? [],
            ...(args.notes ? { notes: args.notes } : {})
          },
          args.idempotencyKey || `analysis-${randomUUID()}`
        ),
      success
    )
)

server.registerTool(
  'pulse_add_comment',
  {
    title: '添加评论',
    description:
      '在需求下添加一条普通评论。评论不会替换正式分析；需要给出推荐结论时请使用 pulse_submit_analysis。',
    inputSchema: {
      idOrCode: z.string().trim().min(1).max(200).describe('需求 UUID 或编号'),
      body: z.string().trim().min(1).max(10_000).describe('评论正文'),
      idempotencyKey: z.string().trim().max(120).optional().describe('幂等键；重试时保持相同值'),
      agent: agentSchema.optional().describe('可选；未提供时使用环境变量')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (args) =>
    guarded(
      () =>
        client.write(
          `/v1/requirements/${encodeURIComponent(args.idOrCode)}/comments`,
          'POST',
          { agent: agentOrDefault(args.agent), body: args.body },
          args.idempotencyKey || `comment-${randomUUID()}`
        ),
      success
    )
)

server.registerTool(
  'pulse_update_status',
  {
    title: '更新需求阶段',
    description:
      '把需求移动到另一个阶段。只有当看板设置允许 Agent 更新阶段时才会成功，否则会返回 FORBIDDEN。不要用它替代人类验收；完成判断仍由人做。',
    inputSchema: {
      idOrCode: z.string().trim().min(1).max(200).describe('需求 UUID 或编号'),
      status: statusSchema.describe('inbox / planned / building / review / done'),
      agent: agentSchema.optional().describe('可选；未提供时使用环境变量')
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false
    }
  },
  async (args) =>
    guarded(
      () =>
        client.write(`/v1/requirements/${encodeURIComponent(args.idOrCode)}`, 'PATCH', {
          agent: agentOrDefault(args.agent),
          status: args.status
        }),
      success
    )
)

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(
    `[requirement-pulse-mcp] connected · bridge=${baseUrl} · agent=${defaultAgent.name} (${defaultAgent.kind})`
  )
}

main().catch((error) => {
  console.error('[requirement-pulse-mcp] fatal:', error)
  process.exit(1)
})
