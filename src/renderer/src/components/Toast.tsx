import { create } from 'zustand'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { requireApi } from '../store'

type ToastTone = 'info' | 'success' | 'error'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

interface ToastStore {
  items: ToastItem[]
  push: (item: ToastItem) => void
  dismiss: (id: number) => void
}

let sequence = 1

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (item) => set((state) => ({ items: [...state.items, item].slice(-4) })),
  dismiss: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
}))

export function toast(message: string, tone: ToastTone = 'info'): void {
  const id = sequence++
  useToastStore.getState().push({ id, message, tone })
  window.setTimeout(
    () => useToastStore.getState().dismiss(id),
    tone === 'error' ? 7000 : 4200
  )
}

export async function copyText(text: string, successMessage = '已复制到剪贴板'): Promise<boolean> {
  try {
    await requireApi().writeClipboard(text)
    toast(successMessage, 'success')
    return true
  } catch (error) {
    toast(error instanceof Error ? error.message : '复制失败', 'error')
    return false
  }
}

export function Toaster() {
  const items = useToastStore((state) => state.items)
  const dismiss = useToastStore((state) => state.dismiss)

  return (
    <div className="toast-viewport">
      {items.map((item) => {
        const Icon = item.tone === 'success' ? CheckCircle2 : item.tone === 'error' ? AlertTriangle : Info
        return (
          <div
            key={item.id}
            className={`toast toast-${item.tone}`}
            role={item.tone === 'error' ? 'alert' : 'status'}
          >
            <Icon size={16} className="toast-icon" aria-hidden="true" />
            <p>{item.message}</p>
            <button
              type="button"
              className="toast-close"
              aria-label="关闭提示"
              onClick={() => dismiss(item.id)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
