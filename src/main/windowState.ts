import { readFileSync, renameSync, writeFileSync } from 'node:fs'

export interface SavedWindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULT_STATE: SavedWindowState = {
  width: 1440,
  height: 900,
  maximized: false
}

export function loadWindowState(filePath: string): SavedWindowState {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<SavedWindowState>
    const width = clampNumber(raw.width, 1024, 3840, DEFAULT_STATE.width)
    const height = clampNumber(raw.height, 720, 2400, DEFAULT_STATE.height)
    return {
      x: Number.isFinite(raw.x) ? Math.round(raw.x as number) : undefined,
      y: Number.isFinite(raw.y) ? Math.round(raw.y as number) : undefined,
      width,
      height,
      maximized: Boolean(raw.maximized)
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveWindowState(filePath: string, state: SavedWindowState): void {
  const temp = `${filePath}.tmp`
  writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8')
  renameSync(temp, filePath)
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.round(Math.max(min, Math.min(max, value)))
}
