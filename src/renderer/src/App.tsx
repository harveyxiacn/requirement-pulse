import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { HashRouter, Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Plus, RotateCcw } from 'lucide-react'
import { useDocumentTitle } from './hooks'
import { bootstrap, useAppStore, useUiStore } from './store'
import { toast } from './components/Toast'
import { Toaster } from './components/Toast'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { CommandPalette } from './components/CommandPalette'
import { RequirementDialog } from './components/RequirementDialog'
import { Button, EmptyState } from './components/ui'
import { BoardPage } from './pages/BoardPage'
import { RequirementPage } from './pages/RequirementPage'
import { AgentDeskPage } from './pages/AgentDeskPage'
import { ActivityPage } from './pages/ActivityPage'
import { SettingsPage } from './pages/SettingsPage'

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Renderer error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="fatal-screen" role="alert">
          <div className="fatal-card">
            <div className="fatal-icon" aria-hidden="true"><AlertTriangle size={22} /></div>
            <h1>界面遇到一个错误</h1>
            <p>你的数据仍然保存在本地 board.json。重新加载界面通常可以恢复。</p>
            <pre>{this.state.error.message}</pre>
            <div className="fatal-actions">
              <Button variant="primary" icon={<RotateCcw size={14} />} onClick={() => window.location.reload()}>
                重新加载
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <HashRouter>
        <Runtime />
      </HashRouter>
    </AppErrorBoundary>
  )
}

function Runtime() {
  const snapshot = useAppStore((state) => state.snapshot)
  const status = useAppStore((state) => state.status)
  const error = useAppStore((state) => state.error)
  const retry = useAppStore((state) => state.retry)
  const createOpen = useUiStore((state) => state.createOpen)
  const createStatus = useUiStore((state) => state.createStatus)
  const closeCreate = useUiStore((state) => state.closeCreate)
  const setPaletteOpen = useUiStore((state) => state.setPaletteOpen)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    void bootstrap().catch(() => undefined)
  }, [])

  const selectedTheme = snapshot?.data.settings.theme ?? 'system'

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    function apply(): void {
      const resolved =
        selectedTheme === 'system' ? (query.matches ? 'dark' : 'light') : selectedTheme
      document.documentElement.dataset.theme = resolved
      try {
        window.localStorage.setItem('pulse:theme', selectedTheme)
      } catch {
        // Theme persistence is a convenience only.
      }
    }
    apply()
    if (selectedTheme === 'system') {
      query.addEventListener('change', apply)
      return () => query.removeEventListener('change', apply)
    }
    return undefined
  }, [selectedTheme])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setPaletteOpen])

  useEffect(() => {
    const scrollContainer = document.querySelector('.page-scroll')
    if (scrollContainer instanceof HTMLElement) scrollContainer.scrollTop = 0
  }, [location.pathname])

  const detailRequirement =
    location.pathname.startsWith('/requirement/') && snapshot
      ? snapshot.data.requirements.find((item) => item.id === location.pathname.split('/')[2])
      : undefined
  const routeTitle =
    location.pathname === '/agents'
      ? 'Agent 值守'
      : location.pathname === '/activity'
        ? '活动记录'
        : location.pathname === '/settings'
          ? '设置'
          : detailRequirement
            ? `${detailRequirement.code} · ${detailRequirement.title}`
            : '需求看板'
  useDocumentTitle(routeTitle)

  if (!snapshot) {
    if (status === 'error') {
      return (
        <div className="fatal-screen">
          <div className="fatal-card">
            <div className="fatal-icon" aria-hidden="true"><AlertTriangle size={22} /></div>
            <h1>无法加载本地工作区</h1>
            <p>{error ?? '未知错误'}</p>
            <p className="fatal-hint">确认应用是通过 Electron 启动的，并检查数据文件是否可读。</p>
            <div className="fatal-actions">
              <Button variant="primary" icon={<RotateCcw size={14} />} onClick={() => void retry().catch(() => undefined)}>
                重试
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="boot-screen" role="status">
        <div className="boot-mark" aria-hidden="true" />
        <p className="boot-title">Requirement Pulse</p>
        <p className="boot-copy">正在加载本地工作区…</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <a
        href="#main-content"
        className="skip-link"
        onClick={() => {
          window.setTimeout(() => document.getElementById('main-content')?.focus(), 0)
        }}
      >
        跳到主要内容
      </a>
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main id="main-content" className="workspace" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<BoardPage />} />
            <Route path="/requirement/:id" element={<RequirementPage />} />
            <Route path="/agents" element={<AgentDeskPage />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>
      </div>

      <CommandPalette />
      <RequirementDialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) closeCreate()
        }}
        defaultStatus={createStatus}
        onSaved={(requirement) => {
          closeCreate()
          toast('需求已创建', 'success')
          navigate(`/requirement/${requirement.id}`)
        }}
      />
      <Toaster />
    </div>
  )
}

function NotFoundPage() {
  useDocumentTitle('页面不存在')
  return (
    <div className="page-scroll">
      <div className="page-content centered-state">
        <EmptyState
          icon={<ArrowLeft size={24} />}
          title="这个页面不存在"
          description="链接可能已经失效，或者页面还没有被实现。"
          action={
            <Link to="/" className="btn btn-primary btn-md">
              <Plus size={14} aria-hidden="true" />
              <span>回到需求看板</span>
            </Link>
          }
        />
      </div>
    </div>
  )
}
