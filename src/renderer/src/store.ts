import { create } from 'zustand'
import type { AppSnapshot, RequirementStatus } from '@shared/types'

type LoadStatus = 'loading' | 'ready' | 'error'

interface AppStore {
  snapshot: AppSnapshot | null
  status: LoadStatus
  error: string | null
  retry: () => Promise<void>
}

let bootPromise: Promise<void> | null = null

export const useAppStore = create<AppStore>(() => ({
  snapshot: null,
  status: 'loading',
  error: null,
  retry: async () => {
    await refreshSnapshot()
  }
}))

export function applySnapshot(snapshot: AppSnapshot): void {
  useAppStore.setState({ snapshot, status: 'ready', error: null })
}

export function setSnapshotError(error: unknown): void {
  useAppStore.setState({
    status: 'error',
    error: describeError(error)
  })
}

export async function refreshSnapshot(): Promise<void> {
  try {
    const snapshot = await requireApi().getSnapshot()
    applySnapshot(snapshot)
  } catch (error) {
    setSnapshotError(error)
    throw error
  }
}

export function bootstrap(): Promise<void> {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    const api = requireApi()
    const snapshot = await api.getSnapshot()
    applySnapshot(snapshot)

    api.onSnapshot((next) => applySnapshot(next))
    api.onNavigate((path) => {
      window.location.hash = path.startsWith('#') ? path : `#${path}`
    })
  })().catch((error) => {
    setSnapshotError(error)
    throw error
  })
  return bootPromise
}

export function requireApi(): NonNullable<Window['pulse']> {
  if (!window.pulse) {
    throw new Error('未检测到桌面运行时。请通过 Electron 启动 Requirement Pulse。')
  }
  return window.pulse
}

export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return '发生了未知错误'
}

interface UiStore {
  paletteOpen: boolean
  createOpen: boolean
  createStatus: RequirementStatus
  openPalette: () => void
  closePalette: () => void
  setPaletteOpen: (open: boolean) => void
  openCreate: (status?: RequirementStatus) => void
  closeCreate: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  paletteOpen: false,
  createOpen: false,
  createStatus: 'inbox',
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  openCreate: (status = 'inbox') => set({ createOpen: true, createStatus: status }),
  closeCreate: () => set({ createOpen: false })
}))
