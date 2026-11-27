import { app } from 'electron'
import path from 'node:path'
import { existsSync } from 'node:fs'

export function resolveUserDataDir(): string {
  const override = process.env.PULSE_USER_DATA_DIR?.trim()
  if (override) return path.resolve(override)
  return app.getPath('userData')
}

export function resolveMcpServerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp-server', 'index.mjs')
  }
  return path.join(app.getAppPath(), 'tools', 'mcp-server', 'dist', 'index.mjs')
}

export function mcpServerExists(): boolean {
  return existsSync(resolveMcpServerPath())
}

export function resolveIconPath(): string | undefined {
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, 'build', 'icon.png')
    : path.join(app.getAppPath(), 'build', 'icon.png')
  return existsSync(candidate) ? candidate : undefined
}
