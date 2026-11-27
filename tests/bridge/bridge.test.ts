import { request as httpRequest } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentBridge } from '../../src/main/bridge'
import {
  CLAUDE,
  CODEX,
  HUMAN,
  createTestWorkspace,
  draft,
  findFreePort,
  type TestWorkspace
} from '../helpers/workspace'
import type { Requirement } from '@shared/types'

let workspace: TestWorkspace
let bridge: AgentBridge
let port: number
let requirement: Requirement

function baseUrl(): string {
  return `http://127.0.0.1:${port}`
}

async function api(
  path: string,
  init: RequestInit = {},
  authorized = true
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (authorized) headers.set('Authorization', `Bearer ${workspace.service.getBridgeToken()}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers })
  const text = await response.text()
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    headers: response.headers
  }
}

beforeEach(async () => {
  workspace = await createTestWorkspace()
  requirement = await workspace.service.createRequirement(draft({ title: '桥接测试需求' }), HUMAN)
  port = await findFreePort()
  bridge = new AgentBridge(workspace.service)
  const status = await bridge.configure(true, port)
  expect(status.running).toBe(true)
})

afterEach(async () => {
  await bridge.stop()
  await workspace.cleanup()
})

describe('AgentBridge HTTP surface', () => {
  it('serves health without a token but protects everything else', async () => {
    const health = await api('/v1/health', {}, false)
    expect(health.status).toBe(200)
    expect(health.body).toMatchObject({ ok: true, data: { status: 'ok' } })

    const unauthorized = await api('/v1/board', {}, false)
    expect(unauthorized.status).toBe(401)
    expect(unauthorized.body.error.code).toBe('UNAUTHORIZED')

    const badToken = await fetch(`${baseUrl()}/v1/board`, {
      headers: { Authorization: 'Bearer definitely-wrong' }
    })
    expect(badToken.status).toBe(401)
  })

  it('returns summary, filtered list and full requirement with brief', async () => {
    const board = await api('/v1/board')
    expect(board.status).toBe(200)
    expect(board.body.data.byStatus.inbox).toBeGreaterThanOrEqual(1)

    const list = await api('/v1/requirements?agentReady=true&q=%E6%A1%A5%E6%8E%A5')
    expect(list.status).toBe(200)
    expect(list.body.data.some((item: { id: string }) => item.id === requirement.id)).toBe(true)

    const detail = await api(`/v1/requirements/${requirement.code}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.requirement.id).toBe(requirement.id)
    expect(detail.body.data.briefMarkdown).toContain(requirement.code)

    const brief = await fetch(`${baseUrl()}/v1/requirements/${requirement.code}/brief`, {
      headers: { Authorization: `Bearer ${workspace.service.getBridgeToken()}` }
    })
    expect(brief.status).toBe(200)
    expect(brief.headers.get('content-type')).toContain('text/markdown')
    expect(await brief.text()).toContain('# REQ-')
  })

  it('enforces claim ownership and returns structured claims', async () => {
    const claim = await api(`/v1/requirements/${requirement.id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ agent: CLAUDE, ttlMinutes: 60 })
    })
    expect(claim.status).toBe(200)
    expect(claim.body.data.claim.agent.name).toBe(CLAUDE.name)

    const conflict = await api(`/v1/requirements/${requirement.id}/claim`, {
      method: 'POST',
      body: JSON.stringify({ agent: CODEX })
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('CLAIM_CONFLICT')
    expect(conflict.body.error.details.claimedBy).toBe(CLAUDE.name)

    const otherAnalysis = await api(`/v1/requirements/${requirement.id}/analyses`, {
      method: 'POST',
      body: JSON.stringify({
        agent: CODEX,
        summary: '试图抢占写入',
        recommendation: 'proceed'
      })
    })
    expect(otherAnalysis.status).toBe(409)

    const release = await api(`/v1/requirements/${requirement.id}/claim`, {
      method: 'DELETE',
      body: JSON.stringify({ agent: CLAUDE })
    })
    expect(release.status).toBe(200)
    expect(release.body.data.released).toBe(true)
    expect(workspace.service.getRequirement(requirement.id).claim).toBeNull()
  })

  it('writes analyses with idempotency and rejects malformed payloads', async () => {
    const payload = {
      agent: CLAUDE,
      summary: '桥接写入分析。',
      recommendation: 'needs-info',
      confidence: 64,
      proposedSteps: ['确认边界'],
      risks: [],
      openQuestions: ['是否需要兼容旧格式？']
    }

    const first = await api(`/v1/requirements/${requirement.id}/analyses`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'bridge-test-analysis' },
      body: JSON.stringify(payload)
    })
    expect(first.status).toBe(201)
    expect(first.body.data.analysis.recommendation).toBe('needs-info')

    const retry = await api(`/v1/requirements/${requirement.id}/analyses`, {
      method: 'POST',
      headers: { 'Idempotency-Key': 'bridge-test-analysis' },
      body: JSON.stringify(payload)
    })
    expect(retry.status).toBe(201)
    expect(retry.body.data.analysis.id).toBe(first.body.data.analysis.id)
    expect(workspace.service.getRequirement(requirement.id).analyses).toHaveLength(1)

    const wrongType = await api(`/v1/requirements/${requirement.id}/analyses`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    })
    expect(wrongType.status).toBe(415)
    expect(wrongType.body.error.code).toBe('UNSUPPORTED_CONTENT_TYPE')

    const invalid = await api(`/v1/requirements/${requirement.id}/analyses`, {
      method: 'POST',
      body: JSON.stringify({ agent: { name: '', kind: 'x' }, summary: '', recommendation: 'nope' })
    })
    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects non-loopback Host headers', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: '/v1/health',
          method: 'GET',
          headers: { Host: 'evil.example.com' }
        },
        (response) => {
          response.resume()
          response.on('end', () => resolve(response.statusCode ?? 0))
        }
      )
      request.on('error', reject)
      request.end()
    })
    expect(status).toBe(403)
  })

  it('rejects bodies larger than 512 KiB', async () => {
    const huge = JSON.stringify({ agent: CLAUDE, summary: 'x'.repeat(513 * 1024), recommendation: 'proceed' })
    const response = await api(`/v1/requirements/${requirement.id}/analyses`, {
      method: 'POST',
      body: huge
    })
    expect(response.status).toBe(413)
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('blocks agent status writes unless explicitly enabled', async () => {
    await workspace.service.updateSettings({ allowAgentStatusUpdates: false })
    const disabled = await api(`/v1/requirements/${requirement.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ agent: CLAUDE, status: 'building' })
    })
    expect(disabled.status).toBe(403)
    expect(disabled.body.error.code).toBe('AGENT_UPDATES_DISABLED')

    await workspace.service.updateSettings({ allowAgentStatusUpdates: true })
    const enabled = await api(`/v1/requirements/${requirement.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ agent: CLAUDE, status: 'building' })
    })
    expect(enabled.status).toBe(200)
    expect(enabled.body.data.requirement.status).toBe('building')
  })

  it('exposes security headers and no wildcard CORS', async () => {
    const response = await api('/v1/board')
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
