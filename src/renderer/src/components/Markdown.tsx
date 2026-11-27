import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownTextNode {
  type: string
  value?: string
  tagName?: string
  children?: MarkdownTextNode[]
}

/** Reads the visible text of a task list item so its checkbox gets a unique name. */
function plainText(node: MarkdownTextNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.value ?? ''
  if (node.type === 'element' && node.tagName === 'input') return ''
  return (node.children ?? []).map(plainText).join('')
}

/** Labels every checkbox found in a task item, including ones wrapped in a paragraph. */
function labelCheckboxes(children: ReactNode, label: string): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child
    if (child.type === 'input') {
      return cloneElement(child as ReactElement<{ 'aria-label'?: string }>, {
        'aria-label': label
      })
    }
    const nested = (child.props as { children?: ReactNode }).children
    return nested === undefined ? child : cloneElement(child, {}, labelCheckboxes(nested, label))
  })
}

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
  },
  li({ node, children, ...props }) {
    const className: unknown = node?.properties?.className
    const classes = Array.isArray(className)
      ? className.map(String)
      : typeof className === 'string'
        ? className.split(/\s+/)
        : []
    if (!classes.includes('task-list-item')) {
      return <li {...props}>{children}</li>
    }

    const label = plainText(node as unknown as MarkdownTextNode).replace(/\s+/g, ' ').trim()
    return <li {...props}>{labelCheckboxes(children, label || '验收项')}</li>
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
