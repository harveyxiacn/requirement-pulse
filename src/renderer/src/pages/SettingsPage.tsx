import { useEffect, useId, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  GitBranch,
  KeyRound,
  Laptop,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Upload
} from 'lucide-react'
import {
  APP_DISPLAY_NAME,
  GITHUB_URL
} from '@shared/types'
import type { SettingsPatch, ThemeSetting } from '@shared/types'
import { applySnapshot, describeError, refreshSnapshot, requireApi, useAppStore } from '../store'
import { useDocumentTitle } from '../hooks'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { copyText, toast } from '../components/Toast'
import { Button, Kbd, Switch, cn } from '../components/ui'

const THEMES: Array<{ value: ThemeSetting; label: string; description: string; icon: typeof Sun }> = [
  { value: 'system', label: '跟随系统', description: '随 Windows 外观切换', icon: Monitor },
  { value: 'light', label: '浅色工作台', description: '暖纸色背景，白天更清晰', icon: Sun },
  { value: 'dark', label: '深色工作台', description: '弱光环境下更安静', icon: Moon }
]

export function SettingsPage() {
  const snapshot = useAppStore((state) => state.snapshot)
  const settings = snapshot?.data.settings
  useDocumentTitle('设置')

  const [name, setName] = useState(settings?.userName ?? '')
  const [port, setPort] = useState(String(settings?.bridgePort ?? ''))
  const [portError, setPortError] = useState<string | null>(null)
  const [themePending, setThemePending] = useState<ThemeSetting | null>(null)
  const [namePending, setNamePending] = useState(false)
  const [portPending, setPortPending] = useState(false)
  const [togglePending, setTogglePending] = useState<string | null>(null)
  const [exportPending, setExportPending] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importPending, setImportPending] = useState(false)
  const nameId = useId()
  const portId = useId()

  useEffect(() => {
    if (settings?.userName) setName(settings.userName)
  }, [settings?.userName])

  useEffect(() => {
    if (settings?.bridgePort) setPort(String(settings.bridgePort))
  }, [settings?.bridgePort])

  if (!snapshot || !settings) return null

  const bridge = snapshot.bridge
  const portValue = Number(port)
  const portValid = Number.isInteger(portValue) && portValue >= 1024 && portValue <= 65_535
  const portChanged = portValid && portValue !== settings.bridgePort
  const nameChanged = name.trim().length > 0 && name.trim() !== settings.userName

  async function applySettings(patch: SettingsPatch, successMessage: string): Promise<boolean> {
    try {
      const next = await requireApi().updateSettings(patch)
      applySnapshot(next)
      if (next.bridge.error && patch.bridgeEnabled !== false) {
        toast(next.bridge.error, 'error')
      } else {
        toast(successMessage, 'success')
      }
      return true
    } catch (error) {
      toast(describeError(error), 'error')
      return false
    }
  }

  async function setTheme(theme: ThemeSetting): Promise<void> {
    if (theme === settings!.theme) return
    setThemePending(theme)
    await applySettings({ theme }, '外观已更新')
    setThemePending(null)
  }

  async function saveName(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!nameChanged || namePending) return
    setNamePending(true)
    await applySettings({ userName: name.trim() }, '显示名称已更新')
    setNamePending(false)
  }

  async function savePort(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!portValid) {
      setPortError('端口必须是 1024 到 65535 之间的整数')
      return
    }
    if (!portChanged || portPending) return
    setPortError(null)
    setPortPending(true)
    await applySettings({ bridgePort: portValue }, `桥接端口已改为 ${portValue}`)
    setPortPending(false)
  }

  async function toggle(key: 'bridgeEnabled' | 'allowAgentStatusUpdates' | 'notifyOnAgentAnalysis', value: boolean): Promise<void> {
    setTogglePending(key)
    const messages: Record<typeof key, string> = {
      bridgeEnabled: value ? 'Agent 桥接已开启' : 'Agent 桥接已关闭',
      allowAgentStatusUpdates: value ? 'Agent 可以更新需求阶段了' : 'Agent 不能再更新需求阶段',
      notifyOnAgentAnalysis: value ? 'Agent 分析通知已开启' : 'Agent 分析通知已关闭'
    }
    await applySettings({ [key]: value } as SettingsPatch, messages[key])
    setTogglePending(null)
  }

  async function exportData(): Promise<void> {
    setExportPending(true)
    try {
      const result = await requireApi().exportData()
      if (!result.canceled) {
        toast(`数据已导出到 ${result.filePath ?? '所选位置'}`, 'success')
      }
    } catch (error) {
      toast(describeError(error), 'error')
    } finally {
      setExportPending(false)
    }
  }

  async function importData(): Promise<void> {
    setImportPending(true)
    try {
      const result = await requireApi().importData()
      if (!result.canceled) {
        await refreshSnapshot()
        toast('数据已导入，工作区已刷新', 'success')
      }
      setImportOpen(false)
    } catch (error) {
      toast(describeError(error), 'error')
    } finally {
      setImportPending(false)
    }
  }

  async function openDataFolder(): Promise<void> {
    try {
      await requireApi().openDataFolder()
    } catch (error) {
      toast(describeError(error), 'error')
    }
  }

  return (
    <div className="page-scroll">
      <div className="page-content settings-page">
        <header className="page-header">
          <div>
            <p className="eyebrow">SETTINGS</p>
            <h1 className="page-title">设置</h1>
            <p className="page-subtitle">
              所有数据都在本机。这里的配置会立即写入 board.json，不需要账号，也不会上传。
            </p>
          </div>
          <span className="settings-saved">
            <CheckCircle2 size={13} aria-hidden="true" />
            本地自动保存
          </span>
        </header>

        <section className="panel settings-section" aria-labelledby="appearance-heading">
          <header className="panel-heading">
            <div>
              <h2 id="appearance-heading">外观</h2>
              <p className="panel-subheading">选择工作台的光线。颜色、对比度和焦点样式会随主题一起验证。</p>
            </div>
            <span className="panel-hint">即时生效</span>
          </header>

          <fieldset className="theme-fieldset" disabled={themePending !== null}>
            <legend className="sr-only">主题</legend>
            <div className="theme-grid">
              {THEMES.map((theme) => {
                const Icon = theme.icon
                const selected = settings.theme === theme.value
                return (
                  <label key={theme.value} className={cn('theme-card', selected && 'is-selected')}>
                    <input
                      type="radio"
                      name="theme"
                      value={theme.value}
                      checked={selected}
                      className="theme-radio"
                      onChange={() => void setTheme(theme.value)}
                    />
                    <span className={cn('theme-preview', `theme-preview-${theme.value}`)} aria-hidden="true">
                      <span className="theme-preview-chrome" />
                      <span className="theme-preview-sidebar" />
                      <span className="theme-preview-canvas">
                        <span />
                        <span />
                        <span />
                      </span>
                    </span>
                    <span className="theme-card-body">
                      <span className="theme-card-title">
                        <Icon size={14} aria-hidden="true" />
                        {theme.label}
                        {selected ? <Check size={14} className="theme-check" aria-hidden="true" /> : null}
                      </span>
                      <span className="theme-card-description">{theme.description}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </section>

        <section className="panel settings-section" aria-labelledby="identity-heading">
          <header className="panel-heading">
            <div>
              <h2 id="identity-heading">身份</h2>
              <p className="panel-subheading">你的操作会以这个名称写入活动记录。Agent 会看到它是人工动作。</p>
            </div>
          </header>
          <form className="settings-form settings-form-inline" onSubmit={(event) => void saveName(event)}>
            <div className="form-field grow">
              <label htmlFor={nameId}>显示名称</label>
              <input
                id={nameId}
                className="text-input"
                value={name}
                maxLength={60}
                placeholder="本地用户"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" loading={namePending} disabled={!nameChanged}>
              保存名称
            </Button>
          </form>
        </section>

        <section className="panel settings-section" aria-labelledby="bridge-heading">
          <header className="panel-heading">
            <div>
              <h2 id="bridge-heading">Agent 接入</h2>
              <p className="panel-subheading">控制本机桥接、Agent 权限和通知。桥接只监听 127.0.0.1。</p>
            </div>
            <span className={cn('inline-status', bridge.running ? 'is-ok' : 'is-warn')}>
              <span className={cn('bridge-status-dot', bridge.running ? 'dot-online' : 'dot-offline')} aria-hidden="true" />
              {bridge.running ? `运行中 · :${bridge.port}` : '未运行'}
            </span>
          </header>

          <div className="setting-rows">
            <div className="setting-row">
              <div className="setting-copy">
                <p className="setting-title">启用本地 Agent 桥接</p>
                <p className="setting-description">
                  在本机启动 HTTP 与 MCP 服务，让 Claude Code、Codex、DeepSeek 读取需求并回写分析。
                </p>
              </div>
              <Switch
                checked={settings.bridgeEnabled}
                onChange={(value) => void toggle('bridgeEnabled', value)}
                label="启用本地 Agent 桥接"
                disabled={togglePending === 'bridgeEnabled'}
              />
            </div>

            <div className="setting-row">
              <div className="setting-copy">
                <p className="setting-title">允许 Agent 更新阶段</p>
                <p className="setting-description">
                  开启后，Agent 可以把需求推进或回退到任意阶段；它们始终不能采纳分析、编辑标题或验收标准。
                </p>
              </div>
              <Switch
                checked={settings.allowAgentStatusUpdates}
                onChange={(value) => void toggle('allowAgentStatusUpdates', value)}
                label="允许 Agent 更新阶段"
                disabled={togglePending === 'allowAgentStatusUpdates'}
              />
            </div>

            <div className="setting-row">
              <div className="setting-copy">
                <p className="setting-title">分析到达时通知</p>
                <p className="setting-description">
                  窗口不在前台时，在 Windows 通知中心提示新分析；点击会打开对应需求。
                </p>
              </div>
              <Switch
                checked={settings.notifyOnAgentAnalysis}
                onChange={(value) => void toggle('notifyOnAgentAnalysis', value)}
                label="分析到达时通知"
                disabled={togglePending === 'notifyOnAgentAnalysis'}
              />
            </div>
          </div>

          <form className="settings-form settings-form-inline bridge-port-form" onSubmit={(event) => void savePort(event)}>
            <div className="form-field">
              <label htmlFor={portId}>桥接端口</label>
              <input
                id={portId}
                className="text-input mono port-input"
                inputMode="numeric"
                value={port}
                aria-invalid={Boolean(portError)}
                aria-describedby={`${portId}-hint`}
                onChange={(event) => {
                  setPort(event.target.value.replace(/[^\d]/g, ''))
                  setPortError(null)
                }}
              />
              <p id={`${portId}-hint`} className={cn('field-hint', portError && 'field-error')}>
                {portError ?? '默认 47321。修改后桥接会自动重启，Agent 配置需要同步更新。'}
              </p>
            </div>
            <Button type="submit" variant="secondary" loading={portPending} disabled={!portChanged}>
              保存并重启桥接
            </Button>
          </form>

          <div className="settings-note">
            <ShieldCheck size={15} aria-hidden="true" />
            <p>令牌在 Agent 值守页管理。轮换令牌会让所有旧配置立即失效。</p>
          </div>
        </section>

        <section className="panel settings-section" aria-labelledby="data-heading">
          <header className="panel-heading">
            <div>
              <h2 id="data-heading">数据与备份</h2>
              <p className="panel-subheading">单文件 JSON 存储。写入使用临时文件与原子替换，每天保留一份备份。</p>
            </div>
            <span className="panel-hint">导出不包含令牌</span>
          </header>

          <div className="path-list">
            <div className="path-row">
              <span className="path-label">数据目录</span>
              <code className="path-value">{snapshot.paths.userData}</code>
              <button type="button" className="icon-btn icon-btn-sm" aria-label="复制数据目录" onClick={() => void copyText(snapshot.paths.userData, '数据目录已复制')}>
                <Copy size={13} aria-hidden="true" />
              </button>
              <button type="button" className="icon-btn icon-btn-sm" aria-label="打开数据目录" onClick={() => void openDataFolder()}>
                <FolderOpen size={13} aria-hidden="true" />
              </button>
            </div>
            <div className="path-row">
              <span className="path-label">看板文件</span>
              <code className="path-value">{snapshot.paths.boardFile}</code>
              <button type="button" className="icon-btn icon-btn-sm" aria-label="复制看板文件路径" onClick={() => void copyText(snapshot.paths.boardFile, '看板文件路径已复制')}>
                <Copy size={13} aria-hidden="true" />
              </button>
            </div>
            <div className="path-row">
              <span className="path-label">备份目录</span>
              <code className="path-value">{snapshot.paths.backupsDir}</code>
              <button type="button" className="icon-btn icon-btn-sm" aria-label="复制备份目录" onClick={() => void copyText(snapshot.paths.backupsDir, '备份目录已复制')}>
                <Copy size={13} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="data-actions">
            <Button variant="secondary" size="sm" icon={<Download size={13} />} loading={exportPending} onClick={() => void exportData()}>
              导出 JSON
            </Button>
            <Button variant="ghost" size="sm" icon={<Upload size={13} />} onClick={() => setImportOpen(true)}>
              导入数据
            </Button>
            <Button variant="ghost" size="sm" icon={<FolderOpen size={13} />} onClick={() => void openDataFolder()}>
              打开数据文件夹
            </Button>
          </div>

          <div className="settings-note settings-note-warn">
            <AlertTriangle size={15} aria-hidden="true" />
            <p>导入会替换当前工作区的需求、分析、评论与活动记录。桥接令牌和端口保持不变，导入前会自动备份。</p>
          </div>
        </section>

        <section className="panel settings-section" aria-labelledby="about-heading">
          <header className="panel-heading">
            <div>
              <h2 id="about-heading">关于</h2>
              <p className="panel-subheading">{APP_DISPLAY_NAME} · 本地优先的需求决策板</p>
            </div>
            <span className="about-version mono">v{snapshot.app.version}</span>
          </header>

          <div className="about-grid">
            <div>
              <h3>键盘快捷键</h3>
              <dl className="shortcut-list">
                <div><dt><Kbd>Ctrl</Kbd><Kbd>K</Kbd></dt><dd>打开命令面板</dd></div>
                <div><dt><Kbd>N</Kbd></dt><dd>在看板新建需求</dd></div>
                <div><dt><Kbd>Space</Kbd></dt><dd>拿起 / 放下聚焦的拖动把手</dd></div>
                <div><dt><Kbd>Esc</Kbd></dt><dd>取消拖动或关闭浮层</dd></div>
                <div><dt><Kbd>Ctrl</Kbd><Kbd>Enter</Kbd></dt><dd>发送评论</dd></div>
              </dl>
            </div>
            <div>
              <h3>项目</h3>
              <div className="about-links">
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="about-link">
                  <GitBranch size={15} aria-hidden="true" />
                  <span>GitHub 仓库</span>
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
                <a href={`${GITHUB_URL}/blob/main/docs/AGENT-PROTOCOL.md`} target="_blank" rel="noreferrer" className="about-link">
                  <KeyRound size={15} aria-hidden="true" />
                  <span>Agent 接入协议</span>
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
                <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className="about-link">
                  <Laptop size={15} aria-hidden="true" />
                  <span>MIT License</span>
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              </div>
              <p className="about-copy">
                数据默认存放在系统用户目录。卸载应用不会删除 board.json，你可以随时手动备份或迁移。
              </p>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="导入并替换当前工作区？"
        description="导入文件中的需求、分析、评论和活动记录会替换当前数据。当前数据会先自动备份到备份目录。桥接令牌、端口和外观设置保持不变。"
        confirmLabel="选择文件并导入"
        tone="danger"
        pending={importPending}
        onConfirm={() => void importData()}
      />
    </div>
  )
}
