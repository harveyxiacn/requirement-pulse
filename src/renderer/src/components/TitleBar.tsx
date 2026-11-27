import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Copy, Minus, Square, Wifi, WifiOff, X } from 'lucide-react'
import { useAppStore } from '../store'
import { cn } from './ui'

function usePageLabel(): string {
  const location = useLocation()
  const snapshot = useAppStore((state) => state.snapshot)
  if (location.pathname.startsWith('/requirement/')) {
    const id = location.pathname.split('/')[2]
    const requirement = snapshot?.data.requirements.find((item) => item.id === id)
    return requirement ? `${requirement.code} · ${requirement.title}` : '需求详情'
  }
  if (location.pathname === '/agents') return 'Agent 值守'
  if (location.pathname === '/activity') return '活动记录'
  if (location.pathname === '/settings') return '设置'
  return '需求看板'
}

export function TitleBar() {
  const bridge = useAppStore((state) => state.snapshot?.bridge)
  const navigate = useNavigate()
  const pageLabel = usePageLabel()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = window.pulse?.window.onMaximizedChange(setMaximized)
    } catch {
      // Runtime unavailable in a plain browser preview.
    }
    return () => unsubscribe?.()
  }, [])

  const statusTone = bridge?.running ? 'online' : bridge?.starting ? 'pending' : bridge?.error ? 'error' : 'offline'

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        <span className="brand-wordmark">
          <strong>Requirement Pulse</strong>
          <span>需求脉冲</span>
        </span>
      </div>

      <div
        className="titlebar-drag"
        onDoubleClick={() => void window.pulse?.window.toggleMaximize()}
      >
        <span className="titlebar-divider" aria-hidden="true" />
        <span className="titlebar-context">{pageLabel}</span>
      </div>

      <div className="titlebar-actions">
        <button
          type="button"
          className="titlebar-bridge"
          title="打开 Agent 值守"
          onClick={() => navigate('/agents')}
        >
          {statusTone === 'offline' || statusTone === 'error' ? (
            <WifiOff size={13} aria-hidden="true" />
          ) : (
            <Wifi size={13} aria-hidden="true" />
          )}
          <span className={cn('bridge-status-dot', `dot-${statusTone}`)} aria-hidden="true" />
          <span className="titlebar-bridge-label">BRIDGE</span>
          <span className="titlebar-bridge-port">:{bridge?.port ?? '—'}</span>
        </button>
        <div className="window-controls">
          <button
            type="button"
            className="window-control"
            aria-label="最小化窗口"
            title="最小化"
            onClick={() => void window.pulse?.window.minimize()}
          >
            <Minus size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="window-control"
            aria-label={maximized ? '还原窗口' : '最大化窗口'}
            title={maximized ? '还原' : '最大化'}
            onClick={() => void window.pulse?.window.toggleMaximize()}
          >
            {maximized ? (
              <Copy size={12} className="restore-icon" aria-hidden="true" />
            ) : (
              <Square size={12} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className="window-control window-control-close"
            aria-label="关闭窗口"
            title="关闭"
            onClick={() => void window.pulse?.window.close()}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
