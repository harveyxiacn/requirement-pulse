import { afterEach, describe, expect, it } from 'vitest'
import {
  CLAUDE,
  CODEX,
  HUMAN,
  createTestWorkspace,
  draft,
  type TestWorkspace
} from '../helpers/workspace'

let workspace: TestWorkspace | undefined

afterEach(async () => {
  await workspace?.cleanup()
  workspace = undefined
})

async function setup(): Promise<TestWorkspace> {
  workspace = await createTestWorkspace()
  return workspace
}

describe('BoardService requirement lifecycle', () => {
  it('creates a requirement with a stable code and recent activity', async () => {
    const { service } = await setup()
    const requirement = await service.createRequirement(draft({ title: '第一条需求' }), HUMAN)

    expect(requirement.code).toMatch(/^REQ-\d{3}$/)
    expect(requirement.id).toBeTruthy()
    expect(requirement.status).toBe('inbox')
    expect(requirement.acceptedAnalysisId).toBeNull()
    expect(service.getRequirement(requirement.code).id).toBe(requirement.id)
    expect(service.getActivity(10).some((item) => item.requirementId === requirement.id)).toBe(true)
  })

  it('moves a requirement between columns and keeps ordering consistent', async () => {
    const { service } = await setup()
    const requirement = await service.createRequirement(draft(), HUMAN)

    const moved = await service.moveRequirement(
      { id: requirement.id, status: 'building', index: 0 },
      HUMAN
    )

    expect(moved.status).toBe('building')
    const building = service.listRequirementSummaries({ status: 'building', limit: 200 })
    expect(building[0]?.id).toBe(requirement.id)
  })

  it('rejects a second agent claim while the first claim is alive', async () => {
    const { service } = await setup()
    const requirement = await service.createRequirement(draft(), HUMAN)

    const first = await service.claimRequirement(requirement.id, CLAUDE, 60)
    expect(first.claim.agent.name).toBe(CLAUDE.name)

    await expect(service.claimRequirement(requirement.id, CODEX, 60)).rejects.toMatchObject({
      code: 'CLAIM_CONFLICT'
    })
    await expect(
      service.submitAnalysis(
        requirement.id,
        {
          summary: 'Codex 尝试写入',
          recommendation: 'proceed',
          proposedSteps: [],
          risks: [],
          openQuestions: []
        },
        CODEX
      )
    ).rejects.toMatchObject({ code: 'CLAIM_CONFLICT' })
  })

  it('lets the owning agent refresh or release its claim', async () => {
    const { service } = await setup()
    const requirement = await service.createRequirement(draft(), HUMAN)
    await service.claimRequirement(requirement.id, CLAUDE, 30)

    const refreshed = await service.claimRequirement(requirement.id, CLAUDE, 120)
    expect(new Date(refreshed.claim.expiresAt).getTime()).toBeGreaterThan(Date.now() + 60 * 60_000)

    const released = await service.releaseClaim(requirement.id, {
      kind: 'agent',
      name: CLAUDE.name,
      agentKind: CLAUDE.kind
    })
    expect(released.claim).toBeNull()
  })

  it('auto-claims on analysis submission and deduplicates retries by idempotency key', async () => {
    const { service } = await setup()
    const requirement = await service.createRequirement(draft(), HUMAN)
    const submission = {
      summary: '结构清晰，可以推进。',
      recommendation: 'proceed' as const,
      confidence: 81,
      estimatedEffort: 'M',
      proposedSteps: ['拆分状态机'],
      risks: ['旧数据缺少版本'],
      openQuestions: ['是否需要迁移脚本？']
    }

    const first = await service.submitAnalysis(requirement.id, submission, CLAUDE, 'test-key-1')
    const second = await service.submitAnalysis(requirement.id, submission, CLAUDE, 'test-key-1')

    expect(second.analysis.id).toBe(first.analysis.id)
    expect(first.requirement.analyses).toHaveLength(1)
    expect(first.requirement.claim?.agent.name).toBe(CLAUDE.name)
    expect(first.analysis.confidence).toBe(81)
  })

  it('keeps analysis acceptance human-only', async () => {
    const { service } = await setup()
    const requirement = await service.createRequirement(draft(), HUMAN)
    const { analysis } = await service.submitAnalysis(
      requirement.id,
      {
        summary: '建议先做最小闭环。',
        recommendation: 'proceed',
        proposedSteps: [],
        risks: [],
        openQuestions: []
      },
      CLAUDE
    )

    await expect(
      service.acceptAnalysis(requirement.id, analysis.id, {
        kind: 'agent',
        name: CLAUDE.name,
        agentKind: CLAUDE.kind
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const accepted = await service.acceptAnalysis(requirement.id, analysis.id, HUMAN)
    expect(accepted.acceptedAnalysisId).toBe(analysis.id)
    expect((await service.getRequirement(requirement.id)).acceptedAnalysisId).toBe(analysis.id)

    const unaccepted = await service.acceptAnalysis(requirement.id, null, HUMAN)
    expect(unaccepted.acceptedAnalysisId).toBeNull()
  })

  it('releases a claim when agent collaboration is disabled', async () => {
    const { service } = await setup()
    const requirement = await service.createRequirement(draft(), HUMAN)
    await service.claimRequirement(requirement.id, CLAUDE, 90)

    const updated = await service.updateRequirement(requirement.id, { agentReady: false }, HUMAN)

    expect(updated.agentReady).toBe(false)
    expect(updated.claim).toBeNull()
    await expect(service.claimRequirement(requirement.id, CODEX, 60)).rejects.toMatchObject({
      code: 'AGENT_NOT_READY'
    })
  })

  it('gates agent status updates behind the workspace setting', async () => {
    const { service } = await setup()
    const requirement = await service.createRequirement(draft({ status: 'planned' }), HUMAN)
    await service.updateSettings({ allowAgentStatusUpdates: false })

    await expect(
      service.updateStatusByAgent(requirement.id, 'building', CLAUDE)
    ).rejects.toMatchObject({ code: 'AGENT_UPDATES_DISABLED' })

    await service.updateSettings({ allowAgentStatusUpdates: true })
    const updated = await service.updateStatusByAgent(requirement.id, 'building', CLAUDE)
    expect(updated.status).toBe('building')
  })

  it('excludes the bridge token from exports', async () => {
    const { service } = await setup()
    const token = service.getBridgeToken()
    const payload = service.exportData()

    expect(token.length).toBeGreaterThan(20)
    expect(JSON.stringify(payload)).not.toContain(token)
    expect(payload.data.settings).not.toHaveProperty('bridgeToken')
  })

  it('round-trips an export and keeps the local bridge token', async () => {
    const { service } = await setup()
    const token = service.getBridgeToken()
    await service.createRequirement(draft({ title: '导入前需求' }), HUMAN)
    const payload = service.exportData()

    const created = await service.createRequirement(draft({ title: '导入后应保留' }), HUMAN)
    expect(created.title).toBe('导入后应保留')

    await service.importData(payload)
    expect(service.getBridgeToken()).toBe(token)
    expect(service.getWorkspaceData().requirements).toHaveLength(
      payload.data.requirements.length
    )
  })
})
