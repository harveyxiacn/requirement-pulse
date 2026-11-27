const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function parse(value: string | null | undefined): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

export function formatRelative(value: string, now = Date.now()): string {
  const time = parse(value)
  if (time === null) return '—'
  const diff = now - time
  if (diff < 45_000) return '刚刚'
  if (diff < MINUTE) return '不到 1 分钟前'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`
  const date = new Date(time)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return sameYear
    ? `${date.getMonth() + 1} 月 ${date.getDate()} 日`
    : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

export function formatAbsolute(value: string): string {
  const time = parse(value)
  if (time === null) return '—'
  const date = new Date(time)
  const pad = (input: number): string => String(input).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

export function formatDateOnly(value: string | null | undefined): string {
  const time = parse(value)
  if (time === null) return '—'
  const date = new Date(time)
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(
    date.getDate()
  ).padStart(2, '0')}`
}

export function formatRemaining(expiresAt: string, now = Date.now()): string {
  const time = parse(expiresAt)
  if (time === null) return '—'
  const diff = time - now
  if (diff <= 0) return '已过期'
  if (diff < HOUR) return `剩 ${Math.max(1, Math.ceil(diff / MINUTE))} 分钟`
  const hours = Math.floor(diff / HOUR)
  const minutes = Math.round((diff % HOUR) / MINUTE)
  return minutes > 0 ? `剩 ${hours} 小时 ${minutes} 分` : `剩 ${hours} 小时`
}

export function dayLabel(value: string, now = Date.now()): string {
  const time = parse(value)
  if (time === null) return '未知日期'
  const date = new Date(time)
  const today = new Date(now)
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startThat = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  if (startThat === startToday) return '今天'
  if (startThat === startToday - DAY) return '昨天'
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

export function formatPercent(value: number | undefined): string | null {
  if (value === undefined || value === null) return null
  return `${Math.round(value)}%`
}

export function splitTags(input: string): string[] {
  const parts = input
    .split(/[,，、;；\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
  return [...new Set(parts)].slice(0, 8)
}
