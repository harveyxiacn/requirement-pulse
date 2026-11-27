import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import path from 'node:path'
import { z, ZodError } from 'zod'
import type { AppSnapshot, IpcResult, RequirementPatch, SettingsPatch } from '@shared/types'
import type { AgentBridge } from './bridge'
import { BoardError } from './errors'
import { formatZodError } from './schemas'
import {
  acceptAnalysisInputSchema,
  addCommentInputSchema,
  moveRequirementInputSchema,
  requirementDraftSchema,
  requirementPatchSchema,
  settingsPatchSchema
} from './schemas'
import type { BoardService } from './service'
import type { JsonBoardStore } from './store'

export interface IpcContext {
  service: BoardService
  bridge: AgentBridge
  store: JsonBoardStore
  window: BrowserWindow
  buildSnapshot: () => AppSnapshot
  broadcast: () => void
  syncRuntime: () => Promise<void>
  restartBridge: () => Promise<void>
}

const idSchema = z.string().trim().min(1).max(200)
const clipboardSchema = z.string().max(100_000)
const externalUrlSchema = z.string().url().max(2_000)

export function registerIpcHandlers(context: IpcContext): void {
  const trusted = (event: IpcMainInvokeEvent): boolean =>
    event.sender === context.window.webContents

  const register = <T>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<T> | T
  ): void => {
    ipcMain.handle(channel, async (event, ...args): Promise<IpcResult<T>> => {
      try {
        if (!trusted(event)) {
          throw new BoardError('UNTRUSTED_SENDER', '拒绝来自未知窗口的请求', 403)
        }
        return { ok: true, value: await handler(event, ...args) }
      } catch (error) {
        return { ok: false, error: toIpcError(error) }
      }
    })
  }

  register('app:getSnapshot', () => context.buildSnapshot())

  register('requirement:create', async (_event, raw) => {
    const input = requirementDraftSchema.parse(raw)
    await context.service.createRequirement(input, humanActor(context.service))
    context.broadcast()
    return context.buildSnapshot()
  })

  register('requirement:update', async (_event, rawId, rawPatch) => {
    const id = idSchema.parse(rawId)
    const patch = requirementPatchSchema.parse(rawPatch) as RequirementPatch
    await context.service.updateRequirement(id, patch, humanActor(context.service))
    context.broadcast()
    return context.buildSnapshot()
  })

  register('requirement:move', async (_event, raw) => {
    const input = moveRequirementInputSchema.parse(raw)
    await context.service.moveRequirement(input, humanActor(context.service))
    context.broadcast()
    return context.buildSnapshot()
  })

  register('requirement:delete', async (_event, rawId) => {
    const id = idSchema.parse(rawId)
    await context.service.deleteRequirement(id, humanActor(context.service))
    context.broadcast()
    return context.buildSnapshot()
  })

  register('requirement:addComment', async (_event, raw) => {
    const input = addCommentInputSchema.parse(raw)
    await context.service.addComment(
      input.requirementId,
      input.body,
      humanActor(context.service)
    )
    context.broadcast()
    return context.buildSnapshot()
  })

  register('requirement:acceptAnalysis', async (_event, raw) => {
    const input = acceptAnalysisInputSchema.parse(raw)
    await context.service.acceptAnalysis(
      input.requirementId,
      input.analysisId,
      humanActor(context.service)
    )
    context.broadcast()
    return context.buildSnapshot()
  })

  register('settings:update', async (_event, raw) => {
    const patch = settingsPatchSchema.parse(raw) as SettingsPatch
    await context.service.updateSettings(patch)
    await context.syncRuntime()
    context.broadcast()
    return context.buildSnapshot()
  })

  register('bridge:restart', async () => {
    await context.restartBridge()
    context.broadcast()
    return context.buildSnapshot()
  })

  register('bridge:rotateToken', async () => {
    await context.service.rotateBridgeToken()
    context.broadcast()
    return context.buildSnapshot()
  })

  register('data:export', async () => {
    const stamp = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog(context.window, {
      title: '导出 Requirement Pulse 数据',
      defaultPath: path.join(
        app.getPath('documents'),
        `requirement-pulse-${stamp}.json`
      ),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }
    const payload = context.service.exportData()
    await context.store.writeExport(payload, result.filePath)
    try {
      await context.service.recordExported()
    } catch (error) {
      console.warn('[ipc] failed to record export activity:', error)
    }
    context.broadcast()
    return { canceled: false, filePath: result.filePath }
  })

  register('data:import', async () => {
    const result = await dialog.showOpenDialog(context.window, {
      title: '导入 Requirement Pulse 数据',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true }
    }
    const filePath = result.filePaths[0]
    let raw: unknown
    try {
      raw = await context.store.readJsonFile(filePath)
    } catch {
      throw new BoardError(
        'IMPORT_INVALID',
        '无法读取该文件，请确认它是合法的 JSON',
        400
      )
    }
    await context.service.importData(raw)
    context.broadcast()
    return { canceled: false }
  })

  register('data:openFolder', async () => {
    const result = await shell.openPath(context.service.getStorePaths().userData)
    if (result) throw new BoardError('OPEN_FOLDER_FAILED', result, 500)
  })

  register('clipboard:write', async (_event, raw) => {
    clipboard.writeText(clipboardSchema.parse(raw))
  })

  register('external:open', async (_event, raw) => {
    const value = externalUrlSchema.parse(raw)
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BoardError('INVALID_URL', '只允许打开 http/https 链接', 400)
    }
    await shell.openExternal(value)
  })

  register('window:minimize', () => {
    context.window.minimize()
  })

  register('window:toggleMaximize', () => {
    if (context.window.isMaximized()) context.window.unmaximize()
    else context.window.maximize()
  })

  register('window:close', () => {
    context.window.close()
  })
}

function humanActor(service: BoardService): {
  kind: 'human'
  name: string
} {
  return { kind: 'human', name: service.getPublicSettings().userName }
}

function toIpcError(error: unknown): {
  code: string
  message: string
  details?: Record<string, unknown>
} {
  if (error instanceof BoardError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    }
  }
  if (error instanceof ZodError) {
    const formatted = formatZodError(error)
    return {
      code: formatted.code,
      message: formatted.message,
      ...(formatted.details ? { details: formatted.details } : {})
    }
  }
  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : '发生未知错误'
  }
}
