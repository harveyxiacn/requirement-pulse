import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { JsonBoardStore } from '../../src/main/store'
import { BoardService } from '../../src/main/service'
import type { Actor, AgentRef, RequirementDraft } from '@shared/types'

export const HUMAN: Actor = { kind: 'human', name: '测试用户' }
export const CLAUDE: AgentRef = {
  name: 'Claude Code',
  kind: 'claude-code',
  model: 'claude-sonnet-5-5'
}
export const CODEX: AgentRef = { name: 'Codex', kind: 'codex', model: 'gpt-5-codex' }

export const baseDraft: RequirementDraft = {
  title: '测试需求',
  description: '用于集成测试的需求描述',
  acceptanceCriteria: '- [ ] 测试通过',
  status: 'inbox',
  priority: 'medium',
  tags: ['test'],
  agentReady: true
}

export interface TestWorkspace {
  dir: string
  store: JsonBoardStore
  service: BoardService
  cleanup: () => Promise<void>
}

export async function createTestWorkspace(): Promise<TestWorkspace> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'requirement-pulse-test-'))
  const store = new JsonBoardStore(dir)
  const service = await BoardService.open(store)
  return {
    dir,
    store,
    service,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true })
    }
  }
}

export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('无法分配测试端口'))
        return
      }
      const { port } = address
      server.close((error) => {
        if (error) reject(error)
        else resolve(port)
      })
    })
  })
}

export function draft(overrides: Partial<RequirementDraft> = {}): RequirementDraft {
  return { ...baseDraft, ...overrides }
}
