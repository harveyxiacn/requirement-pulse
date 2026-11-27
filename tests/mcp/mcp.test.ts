import { existsSync } from 'node:fs'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentBridge } from '../../src/main/bridge'
import {
  HUMAN,
  createTestWorkspace,
  draft,
  findFreePort,
  type TestWorkspace
} from '../helpers/workspace'
import type { Requirement } from '@shared/types'

const mcpPath = path.resolve(process.cwd(), 'tools/mcp-server/dist/index.mjs')

interface ToolTextResult {
  isError?: boolean
  content: Array<{ type: string; text?: string }>
}

let workspace: TestWorkspace
let bridge: AgentBridge
let client: Client
let requirement: Requirement

function childEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  return env
}

async function startMcp(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpPath],
    cwd: process.cwd(),
    env: {
      ...childEnv(),
      PULSE_BRIDGE_URL: `http://127.0.0.1:${bridge.getStatus().port}`,
      PULSE_BRIDGE_TOKEN: workspace.service.getBridgeToken(),
      PULSE_AGENT_NAME: 'MCP Test Agent',
      PULSE_AGENT_KIND: 'generic'
    },
    stderr: 'pipe'
  })
  client = new Client({ name: 'requirement-pulse-tests', version: '0.0.0' })
  await client.connect(transport)
}

async function callTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<{ isError: boolean; data: any; texts: string[] }> {
  const result = (await client.callTool({ name, arguments: args })) as ToolTextResult
  const texts = result.content
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text as string)
  let data: unknown = null
  try {
    data = texts[0] ? JSON.parse(texts[0]) : null
  } catch {
    data = texts[0] ?? null
  }
  return { isError: Boolean(result.isError), data, texts }
}

beforeEach(async () => {
  expect(existsSync(mcpPath), `missing ${mcpPath}; run npm run mcp:build`).toBe(true)
  workspace = await createTestWorkspace()
  requirement = await workspace.service.createRequirement(
    draft({
      title: 'MCP 测试需求',
      description: '验证 stdio MCP 工具可以通过本地桥接读写。',
      acceptanceCriteria: '- [ ] MCP 可读可写'
    }),
    HUMAN
  )
  const port = await findFreePort()
  bridge = new AgentBridge(workspace.service)
  expect((await bridge.configure(true, port)).running).toBe(true)
  await startMcp()
})

afterEach(async () => {
  await client?.close()
  await bridge.stop()
  await workspace.cleanup()
})

describe('Requirement Pulse MCP server', () => {
  it('exposes the documented tools with read/write annotations', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name).sort()

    expect(names).toEqual([
      'pulse_add_comment',
      'pulse_board_summary',
      'pulse_claim_requirement',
      'pulse_get_requirement',
      'pulse_list_requirements',
      'pulse_release_requirement',
      'pulse_submit_analysis',
      'pulse_update_status'
    ])
    const update = tools.find((tool) => tool.name === 'pulse_update_status')
    expect(update?.annotations?.destructiveHint).toBe(true)
    const summary = tools.find((tool) => tool.name === 'pulse_board_summary')
    expect(summary?.annotations?.readOnlyHint).toBe(true)
  })

  it('reads the board and one requirement with its brief', async () => {
    const summary = await callTool('pulse_board_summary')
    expect(summary.isError).toBe(false)
    expect(summary.data.total).toBeGreaterThanOrEqual(1)

    const list = await callTool('pulse_list_requirements', { q: 'MCP 测试' })
    expect(list.isError).toBe(false)
    expect(list.data.count).toBe(1)
    expect(list.data.requirements[0].id).toBe(requirement.id)

    const detail = await callTool('pulse_get_requirement', { idOrCode: requirement.code })
    expect(detail.isError).toBe(false)
    expect(detail.data.id).toBe(requirement.id)
    expect(detail.texts[1]).toContain(requirement.code)
    expect(detail.texts[1]).toContain('工作协议')
  })

  it('claims, writes an analysis from environment identity, and releases', async () => {
    const claim = await callTool('pulse_claim_requirement', {
      idOrCode: requirement.code,
      ttlMinutes: 30
    })
    expect(claim.isError).toBe(false)
    expect(claim.data.claim.agent.name).toBe('MCP Test Agent')

    const submission = await callTool('pulse_submit_analysis', {
      idOrCode: requirement.id,
      summary: 'MCP 写入路径可用，建议推进。',
      recommendation: 'proceed',
      confidence: 92,
      estimatedEffort: 'S',
      proposedSteps: ['保留领取冲突保护'],
      risks: [],
      openQuestions: [],
      idempotencyKey: 'mcp-test-key'
    })
    expect(submission.isError).toBe(false)
    expect(submission.data.analysis.agent.name).toBe('MCP Test Agent')
    expect(submission.data.analysis.recommendation).toBe('proceed')

    const retry = await callTool('pulse_submit_analysis', {
      idOrCode: requirement.id,
      summary: 'MCP 写入路径可用，建议推进。',
      recommendation: 'proceed',
      idempotencyKey: 'mcp-test-key'
    })
    expect(retry.data.analysis.id).toBe(submission.data.analysis.id)

    const comment = await callTool('pulse_add_comment', {
      idOrCode: requirement.code,
      body: '来自 MCP 的补充说明。'
    })
    expect(comment.isError).toBe(false)
    expect(comment.data.comment.author.name).toBe('MCP Test Agent')

    const release = await callTool('pulse_release_requirement', { idOrCode: requirement.code })
    expect(release.isError).toBe(false)
    expect(release.data.released).toBe(true)
    expect(workspace.service.getRequirement(requirement.id).claim).toBeNull()

    const stored = workspace.service.getRequirement(requirement.id)
    expect(stored.analyses).toHaveLength(1)
    expect(stored.comments.at(-1)?.body).toContain('MCP')
  })

  it('maps bridge errors into tool errors and respects status permissions', async () => {
    await workspace.service.updateSettings({ allowAgentStatusUpdates: false })
    const denied = await callTool('pulse_update_status', {
      idOrCode: requirement.code,
      status: 'building'
    })
    expect(denied.isError).toBe(true)
    expect(denied.texts[0]).toContain('AGENT_UPDATES_DISABLED')

    await workspace.service.updateSettings({ allowAgentStatusUpdates: true })

    const moved = await callTool('pulse_update_status', {
      idOrCode: requirement.code,
      status: 'building'
    })
    expect(moved.isError).toBe(false)
    expect(moved.data.requirement.status).toBe('building')
  })

  it('cannot accept its own analysis', async () => {
    const submission = await callTool('pulse_submit_analysis', {
      idOrCode: requirement.code,
      summary: '由人决定是否采纳。',
      recommendation: 'proceed'
    })
    expect(submission.isError).toBe(false)

    const accepted = await workspace.service.acceptAnalysis(
      requirement.id,
      submission.data.analysis.id,
      HUMAN
    )
    expect(accepted.acceptedAnalysisId).toBe(submission.data.analysis.id)

    // Agents may only see the result; there is no MCP tool that accepts analyses.
    const { tools } = await client.listTools()
    expect(tools.some((tool) => /accept/i.test(tool.name))).toBe(false)
  })
})
