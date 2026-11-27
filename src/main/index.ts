import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  dialog,
  nativeTheme,
  screen,
  session,
  shell
} from 'electron'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { resolveUserDataDir, resolveIconPath } from './paths'
import { JsonBoardStore } from './store'
import { BoardService } from './service'
import { AgentBridge } from './bridge'
import { buildSnapshot } from './snapshot'
import { registerIpcHandlers } from './ipc'
import { loadWindowState, saveWindowState, type SavedWindowState } from './windowState'
import { getRecommendationMeta } from '@shared/types'
import type { AppSnapshot } from '@shared/types'

const APP_ID = 'com.harveyxiacn.requirementpulse'
const userDataOverride = process.env.PULSE_USER_DATA_DIR?.trim()
if (userDataOverride) {
  const resolved = path.resolve(userDataOverride)
  mkdirSync(resolved, { recursive: true })
  app.setPath('userData', resolved)
}

app.setName('Requirement Pulse')
app.setAppUserModelId(APP_ID)

const singleInstanceEnabled = process.env.PULSE_DISABLE_SINGLE_INSTANCE !== '1'
const hasLock = singleInstanceEnabled ? app.requestSingleInstanceLock() : true

let mainWindow: BrowserWindow | null = null
let service: BoardService | null = null
let bridge: AgentBridge | null = null
let store: JsonBoardStore | null = null
let windowStateFile = ''
let isQuitting = false
let quitAllowed = false
let shutdownStarted = false

if (!hasLock) {
  app.quit()
} else {
  boot()
}

function boot(): void {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(initialize).catch((error: unknown) => {
    console.error('Failed to start Requirement Pulse:', error)
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    dialog.showErrorBox('Requirement Pulse 启动失败', message)
    app.quit()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.on('before-quit', (event) => {
    if (quitAllowed) return
    event.preventDefault()
    if (shutdownStarted) return
    shutdownStarted = true
    isQuitting = true
    Promise.resolve(bridge?.stop())
      .catch((error) => console.warn('[app] bridge shutdown failed:', error))
      .finally(() => {
        quitAllowed = true
        app.quit()
      })
  })
}

async function initialize(): Promise<void> {
  const dataDir = resolveUserDataDir()
  store = new JsonBoardStore(dataDir)
  service = await BoardService.open(store)
  bridge = new AgentBridge(service)
  windowStateFile = path.join(dataDir, 'window-state.json')

  const settings = service.getPublicSettings()
  nativeTheme.themeSource = settings.theme
  nativeTheme.on('updated', () => updateWindowBackground())

  const savedState = loadWindowState(windowStateFile)
  mainWindow = createWindow(savedState)
  registerIpcHandlers({
    service,
    bridge,
    store,
    window: mainWindow,
    buildSnapshot: () => buildSnapshot(requireService(), requireBridge()),
    broadcast: broadcastSnapshot,
    syncRuntime,
    restartBridge
  })

  service.on('changed', () => broadcastSnapshot())
  service.on('analysis:created', (payload: { analysis: { agent: { name: string }; recommendation: string }; requirement: { id: string; code: string } }) => {
    notifyAnalysis(payload)
  })
  bridge.on('status', () => broadcastSnapshot())

  registerWindowEvents(mainWindow, savedState)
  configurePermissions()
  configureContentSecurityPolicy()
  createApplicationMenu()

  await syncRuntime()
  await loadRenderer(mainWindow)
}

function createWindow(savedState: SavedWindowState): BrowserWindow {
  const bounds = resolveBounds(savedState)
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    frame: false,
    title: 'Requirement Pulse',
    backgroundColor: resolveBackground(),
    ...(resolveIconPath() ? { icon: resolveIconPath() } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      spellcheck: true
    }
  })

  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => {
    if (savedState.maximized) win.maximize()
    win.show()
    sendMaximizedState(win)
  })
  return win
}

function resolveBounds(state: SavedWindowState): {
  width: number
  height: number
  x?: number
  y?: number
} {
  const width = state.width
  const height = state.height
  if (state.x === undefined || state.y === undefined) {
    return { width, height }
  }
  const visible = screen.getAllDisplays().some((display) => {
    const area = display.workArea
    const right = Math.min(state.x! + width, area.x + area.width)
    const bottom = Math.min(state.y! + height, area.y + area.height)
    const overlapWidth = right - Math.max(state.x!, area.x)
    const overlapHeight = bottom - Math.max(state.y!, area.y)
    return overlapWidth > 120 && overlapHeight > 120
  })
  return visible
    ? { width, height, x: state.x, y: state.y }
    : { width, height }
}

function registerWindowEvents(win: BrowserWindow, savedState: SavedWindowState): void {
  const persist = (): void => {
    try {
      const normal = win.getNormalBounds()
      saveWindowState(windowStateFile, {
        x: normal.x,
        y: normal.y,
        width: normal.width,
        height: normal.height,
        maximized: win.isMaximized()
      })
    } catch {
      // Window may already be destroyed.
    }
  }

  win.on('close', persist)
  win.on('maximize', () => sendMaximizedState(win))
  win.on('unmaximize', () => sendMaximizedState(win))
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (isAllowedInternalUrl(url)) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })

  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })

  if (savedState.maximized) {
    win.once('show', () => win.maximize())
  }
}

async function loadRenderer(win: BrowserWindow): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    await win.loadURL(devUrl)
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function configurePermissions(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  session.defaultSession.setPermissionCheckHandler(() => false)
}

/**
 * Locks the renderer down to its own assets. The dev server needs inline/eval
 * for React Refresh and a websocket for HMR; packaged builds do not.
 */
function configureContentSecurityPolicy(): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  const isDev = Boolean(devUrl)
  const scriptSrc = isDev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self'"
  const connectSrc = isDev
    ? "'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
    : "'self'"
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(details.responseHeaders ?? {})) {
      if (key.toLowerCase() === 'content-security-policy') continue
      responseHeaders[key] = value
    }
    responseHeaders['Content-Security-Policy'] = [directives]
    callback({ responseHeaders })
  })
}

function createApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        { role: 'close', label: '关闭窗口' },
        { type: 'separator' },
        { role: 'quit', label: '退出 Requirement Pulse' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function sendMaximizedState(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.webContents.send('window:maximizedChanged', win.isMaximized())
}

async function syncRuntime(): Promise<void> {
  if (!service || !bridge) return
  const settings = service.getPublicSettings()
  nativeTheme.themeSource = settings.theme
  updateWindowBackground()
  await bridge.configure(settings.bridgeEnabled, settings.bridgePort)
  broadcastSnapshot()
}

async function restartBridge(): Promise<void> {
  if (!service || !bridge) return
  const settings = service.getPublicSettings()
  await bridge.stop()
  await bridge.configure(settings.bridgeEnabled, settings.bridgePort)
  broadcastSnapshot()
}

function broadcastSnapshot(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('app:snapshot', buildSnapshot(requireService(), requireBridge()))
}

function notifyAnalysis(payload: {
  analysis: { agent: { name: string }; recommendation: string }
  requirement: { id: string; code: string }
}): void {
  if (!service || !mainWindow || mainWindow.isDestroyed()) return
  if (!service.getPublicSettings().notifyOnAgentAnalysis) return
  if (mainWindow.isFocused()) return
  if (!Notification.isSupported()) return

  const { analysis, requirement } = payload
  const label = getRecommendationMeta(analysis.recommendation as never).label
  const notification = new Notification({
    title: 'Agent 分析已到达',
    body: `${analysis.agent.name} · ${requirement.code} · ${label}`
  })
  notification.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('app:navigate', `/requirement/${requirement.id}`)
  })
  notification.show()
}

function updateWindowBackground(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setBackgroundColor(resolveBackground())
}

function resolveBackground(): string {
  const theme = service?.getPublicSettings().theme ?? 'system'
  const dark =
    theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
  return dark ? '#0f120e' : '#f2f0e8'
}

function isAllowedInternalUrl(url: string): boolean {
  if (url.startsWith('file://')) return true
  const devUrl = process.env.ELECTRON_RENDERER_URL
  return Boolean(devUrl && url.startsWith(devUrl))
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function requireService(): BoardService {
  if (!service) throw new Error('Service not initialized')
  return service
}

function requireBridge(): AgentBridge {
  if (!bridge) throw new Error('Bridge not initialized')
  return bridge
}

process.on('unhandledRejection', (reason) => {
  if (isQuitting) return
  console.error('[app] unhandled rejection:', reason)
})

export type { AppSnapshot }
