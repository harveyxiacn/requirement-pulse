import * as Dialog from '@radix-ui/react-dialog'
import { Command as CommandMenu } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import {
  Activity as ActivityIcon,
  Check,
  Command as CommandIcon,
  Download,
  FolderOpen,
  Inbox,
  Monitor,
  Moon,
  Plus,
  Radio,
  Search,
  Settings,
  Sun
} from 'lucide-react'
import type { ThemeSetting } from '@shared/types'
import { getStatusMeta } from '@shared/types'
import { applySnapshot, describeError, requireApi, useAppStore, useUiStore } from '../store'
import { formatRelative } from '../format'
import { toast } from './Toast'
import { Kbd } from './ui'

export function CommandPalette() {
  const open = useUiStore((state) => state.paletteOpen)
  const setOpen = useUiStore((state) => state.setPaletteOpen)
  const openCreate = useUiStore((state) => state.openCreate)
  const snapshot = useAppStore((state) => state.snapshot)
  const navigate = useNavigate()

  function close(): void {
    setOpen(false)
  }

  function go(path: string): void {
    setOpen(false)
    navigate(path)
  }

  function create(): void {
    setOpen(false)
    window.setTimeout(() => openCreate('inbox'), 60)
  }

  async function setTheme(theme: ThemeSetting): Promise<void> {
    close()
    try {
      const next = await requireApi().updateSettings({ theme })
      applySnapshot(next)
    } catch (error) {
      toast(describeError(error), 'error')
    }
  }

  async function exportData(): Promise<void> {
    close()
    try {
      const result = await requireApi().exportData()
      if (!result.canceled) {
        toast(`已导出到 ${result.filePath ?? '所选位置'}`, 'success')
      }
    } catch (error) {
      toast(describeError(error), 'error')
    }
  }

  async function openFolder(): Promise<void> {
    close()
    try {
      await requireApi().openDataFolder()
    } catch (error) {
      toast(describeError(error), 'error')
    }
  }

  const requirements = snapshot
    ? [...snapshot.data.requirements].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    : []

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay palette-overlay" />
        <Dialog.Content className="palette-content" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">命令面板</Dialog.Title>
          <CommandMenu label="命令面板" loop className="palette">
            <div className="palette-search">
              <Search size={16} aria-hidden="true" />
              <CommandMenu.Input
                autoFocus
                placeholder="搜索需求、跳转页面或执行命令…"
                className="palette-input"
                aria-label="搜索命令或需求"
              />
              <Kbd>Esc</Kbd>
            </div>
            <CommandMenu.List className="palette-list">
              <CommandMenu.Empty className="palette-empty">
                没有匹配结果。试试需求编号、标题或「新建」。
              </CommandMenu.Empty>

              <CommandMenu.Group heading="操作" className="palette-group">
                <CommandMenu.Item className="palette-item" onSelect={create}>
                  <Plus size={15} aria-hidden="true" />
                  <span>新建需求</span>
                  <span className="palette-hint">写下一条待判断的想法</span>
                </CommandMenu.Item>
                <CommandMenu.Item className="palette-item" onSelect={() => go('/')}>
                  <Inbox size={15} aria-hidden="true" />
                  <span>打开需求看板</span>
                  <span className="palette-hint">五阶段看板</span>
                </CommandMenu.Item>
                <CommandMenu.Item className="palette-item" onSelect={() => go('/agents')}>
                  <Radio size={15} aria-hidden="true" />
                  <span>打开 Agent 值守</span>
                  <span className="palette-hint">桥接与接入配置</span>
                </CommandMenu.Item>
                <CommandMenu.Item className="palette-item" onSelect={() => go('/activity')}>
                  <ActivityIcon size={15} aria-hidden="true" />
                  <span>打开活动记录</span>
                  <span className="palette-hint">最近 200 条变更</span>
                </CommandMenu.Item>
                <CommandMenu.Item className="palette-item" onSelect={() => go('/settings')}>
                  <Settings size={15} aria-hidden="true" />
                  <span>打开设置</span>
                  <span className="palette-hint">外观、身份与数据</span>
                </CommandMenu.Item>
              </CommandMenu.Group>

              <CommandMenu.Separator className="palette-separator" />

              <CommandMenu.Group heading="外观" className="palette-group">
                <CommandMenu.Item className="palette-item" onSelect={() => void setTheme('system')}>
                  <Monitor size={15} aria-hidden="true" />
                  <span>主题：跟随系统</span>
                  {snapshot?.data.settings.theme === 'system' ? <Check size={14} className="palette-check" aria-hidden="true" /> : null}
                </CommandMenu.Item>
                <CommandMenu.Item className="palette-item" onSelect={() => void setTheme('light')}>
                  <Sun size={15} aria-hidden="true" />
                  <span>主题：浅色</span>
                  {snapshot?.data.settings.theme === 'light' ? <Check size={14} className="palette-check" aria-hidden="true" /> : null}
                </CommandMenu.Item>
                <CommandMenu.Item className="palette-item" onSelect={() => void setTheme('dark')}>
                  <Moon size={15} aria-hidden="true" />
                  <span>主题：深色</span>
                  {snapshot?.data.settings.theme === 'dark' ? <Check size={14} className="palette-check" aria-hidden="true" /> : null}
                </CommandMenu.Item>
              </CommandMenu.Group>

              <CommandMenu.Separator className="palette-separator" />

              <CommandMenu.Group heading="数据" className="palette-group">
                <CommandMenu.Item className="palette-item" onSelect={() => void exportData()}>
                  <Download size={15} aria-hidden="true" />
                  <span>导出数据</span>
                  <span className="palette-hint">保存为 JSON</span>
                </CommandMenu.Item>
                <CommandMenu.Item className="palette-item" onSelect={() => void openFolder()}>
                  <FolderOpen size={15} aria-hidden="true" />
                  <span>打开数据文件夹</span>
                  <span className="palette-hint">board.json 与备份</span>
                </CommandMenu.Item>
              </CommandMenu.Group>

              {requirements.length > 0 ? (
                <>
                  <CommandMenu.Separator className="palette-separator" />
                  <CommandMenu.Group heading="需求" className="palette-group">
                    {requirements.map((requirement) => (
                      <CommandMenu.Item
                        key={requirement.id}
                        value={`${requirement.code} ${requirement.title} ${requirement.tags.join(' ')}`}
                        className="palette-item"
                        onSelect={() => go(`/requirement/${requirement.id}`)}
                      >
                        <span className={`status-dot status-tone-${requirement.status}`} aria-hidden="true" />
                        <span className="palette-requirement-title">{requirement.title}</span>
                        <span className="palette-code">{requirement.code}</span>
                        <span className="palette-hint">
                          {getStatusMeta(requirement.status).label} · {formatRelative(requirement.updatedAt)}
                        </span>
                      </CommandMenu.Item>
                    ))}
                  </CommandMenu.Group>
                </>
              ) : null}
            </CommandMenu.List>
            <footer className="palette-footer">
              <span><CommandIcon size={12} aria-hidden="true" /> 命令面板</span>
              <span><Kbd>↑</Kbd><Kbd>↓</Kbd> 选择</span>
              <span><Kbd>Enter</Kbd> 执行</span>
            </footer>
          </CommandMenu>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
