import { app } from 'electron'
import type { AppSnapshot } from '@shared/types'
import type { AgentBridge } from './bridge'
import { mcpServerExists, resolveMcpServerPath } from './paths'
import type { BoardService } from './service'

export function buildSnapshot(
  service: BoardService,
  bridge: AgentBridge
): AppSnapshot {
  const settings = service.getPublicSettings()
  const status = bridge.getStatus()
  const port = status.port || settings.bridgePort
  const startupNotice = service.getStartupNotice()
  return {
    data: service.getWorkspaceData(),
    bridge: {
      running: status.running,
      starting: status.starting,
      port,
      url: `http://127.0.0.1:${port}`,
      token: service.getBridgeToken(),
      mcpServerPath: resolveMcpServerPath(),
      mcpServerReady: mcpServerExists(),
      ...(status.error ? { error: status.error } : {})
    },
    paths: service.getStorePaths(),
    app: {
      version: app.getVersion(),
      platform: process.platform,
      isPackaged: app.isPackaged
    },
    ...(startupNotice ? { startupNotice } : {})
  }
}
