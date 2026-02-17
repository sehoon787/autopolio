import ReactMarkdown from 'react-markdown'

/**
 * Renders markdown inline (strips wrapping <p> tags).
 * Use for LLM-generated text inside list items, spans, etc.
 */
export function InlineMarkdown({ children, className }: { children: string; className?: string }) {
  return (
    <ReactMarkdown
      components={{
        // Strip <p> wrapper so content renders inline
        p: ({ children: pChildren }) => <span>{pChildren}</span>,
      }}
      className={className}
    >
      {children}
    </ReactMarkdown>
  )
}
