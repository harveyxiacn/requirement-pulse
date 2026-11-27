import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { BoardData } from './schemas'

const MAX_BACKUPS = 10
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1_000

export interface StorePaths {
  userData: string
  boardFile: string
  backupsDir: string
}

export interface StoreReadResult {
  exists: boolean
  raw: unknown | null
  parseError?: string
}

export class JsonBoardStore {
  readonly dataDir: string
  readonly boardFile: string
  readonly backupsDir: string
  private writeChain: Promise<void> = Promise.resolve()
  private lastBackupCheck = 0

  constructor(dataDir: string) {
    this.dataDir = dataDir
    this.boardFile = path.join(dataDir, 'board.json')
    this.backupsDir = path.join(dataDir, 'backups')
  }

  getPaths(): StorePaths {
    return {
      userData: this.dataDir,
      boardFile: this.boardFile,
      backupsDir: this.backupsDir
    }
  }

  async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true })
    await fs.mkdir(this.backupsDir, { recursive: true })
  }

  async readBoardFile(): Promise<StoreReadResult> {
    try {
      const text = await fs.readFile(this.boardFile, 'utf8')
      try {
        return { exists: true, raw: JSON.parse(text) }
      } catch (error) {
        return {
          exists: true,
          raw: null,
          parseError: error instanceof Error ? error.message : 'JSON 解析失败'
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { exists: false, raw: null }
      }
      throw error
    }
  }

  async quarantineBoardFile(): Promise<string | null> {
    try {
      await fs.access(this.boardFile)
    } catch {
      return null
    }
    await this.ensureDirectories()
    const stamp = timestampForFile(new Date())
    let target = path.join(this.backupsDir, `corrupt-${stamp}.json`)
    let suffix = 0
    while (await exists(target)) {
      suffix += 1
      target = path.join(this.backupsDir, `corrupt-${stamp}-${suffix}.json`)
    }
    await fs.rename(this.boardFile, target)
    return target
  }

  async save(data: BoardData): Promise<void> {
    const serialized = JSON.stringify(data, null, 2)
    const run = async (): Promise<void> => {
      await this.ensureDirectories()
      await this.maybeBackupCurrentFile()
      const tempFile = path.join(
        this.dataDir,
        `board.json.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
      )
      const handle = await fs.open(tempFile, 'w', 0o600)
      try {
        await handle.writeFile(serialized, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await renameWithRetry(tempFile, this.boardFile)
      this.lastBackupCheck = Date.now()
    }

    const next = this.writeChain.then(run, run)
    this.writeChain = next.catch(() => undefined)
    return next
  }

  async backupCurrentFile(force = false): Promise<string | null> {
    try {
      await fs.access(this.boardFile)
    } catch {
      return null
    }
    await this.ensureDirectories()
    const now = Date.now()
    if (!force && now - this.lastBackupCheck < BACKUP_INTERVAL_MS) {
      return null
    }
    const backups = await this.listBackups()
    const latest = backups[0]
    if (!force && latest) {
      const stat = await fs.stat(latest)
      if (now - stat.mtimeMs < BACKUP_INTERVAL_MS) {
        this.lastBackupCheck = now
        return null
      }
    }
    let target = path.join(this.backupsDir, `board-${timestampForFile(new Date())}.json`)
    let suffix = 0
    while (await exists(target)) {
      suffix += 1
      target = path.join(
        this.backupsDir,
        `board-${timestampForFile(new Date())}-${suffix}.json`
      )
    }
    await fs.copyFile(this.boardFile, target)
    this.lastBackupCheck = now
    await this.pruneBackups()
    return target
  }

  async writeExport(payload: unknown, filePath: string): Promise<void> {
    const serialized = JSON.stringify(payload, null, 2)
    await fs.writeFile(filePath, serialized, 'utf8')
  }

  async readJsonFile(filePath: string): Promise<unknown> {
    const text = await fs.readFile(filePath, 'utf8')
    return JSON.parse(text)
  }

  private async maybeBackupCurrentFile(): Promise<void> {
    if (Date.now() - this.lastBackupCheck < BACKUP_INTERVAL_MS) return
    try {
      await this.backupCurrentFile(false)
    } catch (error) {
      console.warn('[store] backup failed, continuing with save:', safeMessage(error))
    } finally {
      this.lastBackupCheck = Date.now()
    }
  }

  private async listBackups(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.backupsDir)
      return entries
        .filter((name) => /^board-.*\.json$/.test(name))
        .sort()
        .reverse()
        .map((name) => path.join(this.backupsDir, name))
    } catch {
      return []
    }
  }

  private async pruneBackups(): Promise<void> {
    const backups = await this.listBackups()
    await Promise.all(
      backups.slice(MAX_BACKUPS).map((file) =>
        fs.unlink(file).catch(() => undefined)
      )
    )
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await fs.rename(from, to)
      return
    } catch (error) {
      lastError = error
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)))
    }
  }
  throw lastError
}

function timestampForFile(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}-${String(date.getMilliseconds()).padStart(3, '0')}`
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
