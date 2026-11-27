#!/usr/bin/env node
/**
 * Smoke-tests the packaged Windows build: launches win-unpacked, confirms the
 * renderer, reads the local bridge config, calls the HTTP API, and runs one MCP
 * tool over stdio. Run `npm run dist:win` first.
 */
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = path.resolve(import.meta.dirname, '..')
const exe = path.join(root, 'release', 'win-unpacked', 'Requirement Pulse.exe')
if (!existsSync(exe)) {
  console.error(`[smoke] missing ${exe}; run npm run dist:win first`)
  process.exit(1)
}

const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'requirement-pulse-smoke-'))
const app = await electron.launch({
  executablePath: exe,
  env: {
    ...process.env,
    PULSE_USER_DATA_DIR: userDataDir,
    PULSE_DISABLE_SINGLE_INSTANCE: '1'
  }
})

try {
  const page = await app.firstWindow()
  await page.waitForSelector('.board-page')
  await page.waitForFunction(() => document.querySelectorAll('.requirement-card').length > 0)
  await page.getByRole('link', { name: /Agent 值守/ }).click()
  await page.waitForSelector('.bridge-path')

  const mcpPath = (await page.locator('.bridge-path').textContent())?.trim() ?? ''
  const board = JSON.parse(await readFile(path.join(userDataDir, 'board.json'), 'utf8'))
  const token = board.settings.bridgeToken
  const port = board.settings.bridgePort

  const health = await fetch(`http://127.0.0.1:${port}/v1/health`).then((response) => response.json())
  if (health?.data?.status !== 'ok') throw new Error('bridge health check failed')

  const list = await fetch(`http://127.0.0.1:${port}/v1/requirements?limit=2`, {
    headers: { Authorization: `Bearer ${token}` }
  }).then((response) => response.json())
  if (!list.ok) throw new Error('bridge list request failed')

  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value
  }
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpPath],
    env: {
      ...env,
      PULSE_BRIDGE_URL: `http://127.0.0.1:${port}`,
      PULSE_BRIDGE_TOKEN: token,
      PULSE_AGENT_NAME: 'Packaged Smoke',
      PULSE_AGENT_KIND: 'generic'
    },
    stderr: 'pipe'
  })
  const client = new Client({ name: 'packaged-smoke', version: '0.0.0' })
  await client.connect(transport)
  const tools = await client.listTools()
  if (tools.tools.length !== 8) throw new Error(`expected 8 MCP tools, got ${tools.tools.length}`)
  const summary = await client.callTool({ name: 'pulse_board_summary', arguments: {} })
  if (summary.isError) throw new Error('pulse_board_summary failed')
  await client.close()

  console.log('[smoke] renderer: ok')
  console.log(`[smoke] bridge: http://127.0.0.1:${port} · ${list.data.length} requirements`)
  console.log(`[smoke] mcp: ${tools.tools.length} tools · ${path.basename(mcpPath)}`)
  console.log('[smoke] packaged app verified')
} finally {
  await app.close().catch(() => {})
  await rm(userDataDir, { recursive: true, force: true })
}
