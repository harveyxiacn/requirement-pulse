import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const components: Components = {
  a({ href, children }) {
    const external = Boolean(href && /^https?:\/\//i.test(href))
    return (
      <a
        href={href}
        {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
        className={external ? 'external-link' : undefined}
      >
        {children}
      </a>
    )
  }
}

export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`markdown ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
