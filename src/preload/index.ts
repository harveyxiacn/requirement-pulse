import { contextBridge, ipcRenderer } from 'electron'
import type {
  AcceptAnalysisInput,
  AddCommentInput,
  AppSnapshot,
  ExportDialogResult,
  IpcResult,
  ImportDialogResult,
  MoveRequirementInput,
  PulseApi,
  RequirementDraft,
  RequirementPatch,
  SettingsPatch
} from '../shared/types'

class PulseRendererError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(error: NonNullable<IpcResult<unknown>['error']>) {
    super(error.message)
    this.name = 'PulseApiError'
    this.code = error.code
    this.details = error.details
  }
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!result.ok) {
    throw new PulseRendererError(
      result.error ?? { code: 'INTERNAL_ERROR', message: '未知错误' }
    )
  }
  return result.value as T
}

function subscribe(channel: string, listener: (...args: never[]) => void): () => void {
  const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
    listener(...(args as never[]))
  }
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

const api: PulseApi = {
  getSnapshot: () => invoke<AppSnapshot>('app:getSnapshot'),
  onSnapshot: (listener) => subscribe('app:snapshot', listener as never),
  onNavigate: (listener) => subscribe('app:navigate', listener as never),
  createRequirement: (input: RequirementDraft) =>
    invoke<AppSnapshot>('requirement:create', input),
  updateRequirement: (id: string, patch: RequirementPatch) =>
    invoke<AppSnapshot>('requirement:update', id, patch),
  moveRequirement: (input: MoveRequirementInput) =>
    invoke<AppSnapshot>('requirement:move', input),
  deleteRequirement: (id: string) =>
    invoke<AppSnapshot>('requirement:delete', id),
  addComment: (input: AddCommentInput) =>
    invoke<AppSnapshot>('requirement:addComment', input),
  acceptAnalysis: (input: AcceptAnalysisInput) =>
    invoke<AppSnapshot>('requirement:acceptAnalysis', input),
  updateSettings: (patch: SettingsPatch) =>
    invoke<AppSnapshot>('settings:update', patch),
  restartBridge: () => invoke<AppSnapshot>('bridge:restart'),
  rotateBridgeToken: () => invoke<AppSnapshot>('bridge:rotateToken'),
  exportData: () => invoke<ExportDialogResult>('data:export'),
  importData: () => invoke<ImportDialogResult>('data:import'),
  openDataFolder: () => invoke<void>('data:openFolder'),
  writeClipboard: (text: string) => invoke<void>('clipboard:write', text),
  openExternal: (url: string) => invoke<void>('external:open', url),
  window: {
    minimize: () => invoke<void>('window:minimize'),
    toggleMaximize: () => invoke<void>('window:toggleMaximize'),
    close: () => invoke<void>('window:close'),
    onMaximizedChange: (listener) => subscribe('window:maximizedChanged', listener as never)
  }
}

contextBridge.exposeInMainWorld('pulse', api)
