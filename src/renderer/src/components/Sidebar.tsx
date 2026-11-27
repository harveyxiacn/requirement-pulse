import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { NavLink } from 'react-router-dom'
import {
  Activity,
  Check,
  Command,
  Inbox,
  Monitor,
  Moon,
  Radio,
  Settings,
  Sun
} from 'lucide-react'
import type { ThemeSetting } from '@shared/types'
import { applySnapshot, describeError, requireApi, useAppStore, useUiStore } from '../store'
import { toast } from './Toast'
import { cn, Kbd } from './ui'

const NAV_ITEMS = [
  { to: '/', label: '需求看板', icon: Inbox, end: true, countKey: 'board' as const },
  { to: '/agents', label: 'Agent 值守', icon: Radio, countKey: 'agents' as const },
  { to: '/activity', label: '活动记录', icon: Activity, countKey: null },
  { to: '/settings', label: '设置', icon: Settings, countKey: null }
]

const THEMES: Array<{ value: ThemeSetting; label: string; icon: typeof Sun }> = [
  { value: 'system', label: '跟随系统', icon: Monitor },
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon }
]

export function Sidebar() {
  const snapshot = useAppStore((state) => state.snapshot)
  const openPalette = useUiStore((state) => state.openPalette)
  if (!snapshot) return null

  const { settings, requirements, agents } = snapshot.data
  const openCount = requirements.filter((item) => item.status !== 'done').length
  const reviewCount = requirements.filter((item) => item.status === 'review').length
  const activeClaims = requirements.filter(
    (item) => item.claim && Date.parse(item.claim.expiresAt) > Date.now()
  ).length
  const bridge = snapshot.bridge

  const counts: Record<'board' | 'agents', number | null> = {
    board: openCount,
    agents: activeClaims
  }

  async function setTheme(theme: ThemeSetting): Promise<void> {
    try {
      const next = await requireApi().updateSettings({ theme })
      applySnapshot(next)
    } catch (error) {
      toast(describeError(error), 'error')
    }
  }

  const CurrentThemeIcon = THEMES.find((item) => item.value === settings.theme)?.icon ?? Monitor

  return (
    <aside className="sidebar" aria-label="主导航">
      <div className="sidebar-workspace">
        <p className="eyebrow">LOCAL WORKSPACE</p>
        <p className="workspace-name">个人工作台</p>
        <p className="workspace-meta">{requirements.length} 条需求 · {agents.length} 个 Agent</p>
      </div>

      <nav className="sidebar-nav">
        <p className="sidebar-nav-label">工作台</p>
        {NAV_ITEMS.map((item) => {
          const count = item.countKey ? counts[item.countKey] : null
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn('nav-item', isActive && 'is-active')}
              title={item.label}
            >
              <item.icon size={16} strokeWidth={1.9} aria-hidden="true" className="nav-icon" />
              <span className="nav-label">{item.label}</span>
              {item.to === '/' && reviewCount > 0 ? (
                <span className="nav-badge nav-badge-signal" title={`${reviewCount} 条待验收`}>
                  {reviewCount}
                </span>
              ) : count !== null && count > 0 ? (
                <span className="nav-badge">{count}</span>
              ) : null}
            </NavLink>
          )
        })}
      </nav>

      <button type="button" className="sidebar-command" onClick={openPalette} title="打开命令面板">
        <Command size={15} aria-hidden="true" />
        <span className="nav-label">命令面板</span>
        <Kbd>Ctrl K</Kbd>
      </button>

      <div className="sidebar-spacer" />

      <NavLink to="/agents" className={({ isActive }) => cn('bridge-card', isActive && 'is-active')}>
        <div className="bridge-card-top">
          <span className={cn('bridge-status-dot', bridge.running ? 'dot-online' : bridge.error ? 'dot-error' : 'dot-offline')} aria-hidden="true" />
          <span className="bridge-card-title">Agent 桥接</span>
          <span className="bridge-card-port">:{bridge.port}</span>
        </div>
        <p className="bridge-card-detail">
          {bridge.running
            ? activeClaims > 0
              ? `${activeClaims} 个需求正在被分析`
              : '正在监听本机 Agent'
            : bridge.starting
              ? '正在启动…'
              : settings.bridgeEnabled
                ? '桥接未运行'
                : '桥接已关闭'}
        </p>
      </NavLink>

      <div className="sidebar-footer">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className="sidebar-theme" title="切换主题">
              <CurrentThemeIcon size={15} aria-hidden="true" />
              <span className="nav-label">
                {THEMES.find((item) => item.value === settings.theme)?.label ?? '跟随系统'}
              </span>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu-content" side="top" align="start" sideOffset={8}>
              <DropdownMenu.Label className="menu-label">外观</DropdownMenu.Label>
              {THEMES.map((item) => (
                <DropdownMenu.Item
                  key={item.value}
                  className="menu-item"
                  onSelect={() => void setTheme(item.value)}
                >
                  <item.icon size={14} aria-hidden="true" />
                  <span className="menu-item-main">{item.label}</span>
                  {settings.theme === item.value ? <Check size={14} className="menu-check" aria-hidden="true" /> : null}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Arrow className="menu-arrow" />
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <p className="sidebar-version">v{snapshot.app.version} · 本地优先</p>
      </div>
    </aside>
  )
}
