/**
 * Markdown Renderer Utility
 * Converts Markdown to HTML for preview purposes
 */

/**
 * Convert Markdown to styled HTML for preview
 * @param md - Markdown string to convert
 * @returns Full HTML document string with styles
 */
export function markdownToHtml(md: string): string {
  let html = md
    // Headers
    .replace(/^### (.*$)/gm, '<h3 style="margin: 16px 0 8px; font-size: 1.1em; font-weight: 600;">$1</h3>')
    .replace(/^## (.*$)/gm, '<h2 style="margin: 20px 0 10px; font-size: 1.3em; font-weight: 600; border-bottom: 1px solid #e0e0e0; padding-bottom: 8px;">$1</h2>')
    .replace(/^# (.*$)/gm, '<h1 style="margin: 0 0 16px; font-size: 1.8em; font-weight: 700; text-align: center;">$1</h1>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" style="color: #3366ff; text-decoration: none;">$1</a>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr style="margin: 16px 0; border: none; border-top: 1px solid #e0e0e0;" />')
    // Lists
    .replace(/^- (.*$)/gm, '<li style="margin: 4px 0;">$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p style="margin: 12px 0;">')
    .replace(/\n/g, '<br />')

  // Wrap in container
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px;
          margin: 40px auto;
          padding: 20px 40px;
          line-height: 1.6;
          color: #333;
          background: #fff;
        }
        ul { list-style: disc; padding-left: 24px; margin: 8px 0; }
        li { margin: 4px 0; }
      </style>
    </head>
    <body>
      <p style="margin: 12px 0;">${html}</p>
    </body>
    </html>
  `
}

/**
 * Generate Word-style preview HTML from Markdown
 * Uses A4-like styling for document preview
 * @param markdown - Markdown string to convert
 * @returns Full HTML document string with Word-like styles
 */
export function generateWordPreviewHtml(markdown: string): string {
  if (!markdown) return ''

  // Get body content from markdownToHtml
  const basicHtml = markdownToHtml(markdown)
  const bodyContent = basicHtml
    .replace(/<html>.*<body>/s, '')
    .replace(/<\/body>.*<\/html>/s, '')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
          max-width: 210mm;
          min-height: 297mm;
          margin: 20px auto;
          padding: 25mm;
          background: #fff;
          box-shadow: 0 0 20px rgba(0,0,0,0.1);
          line-height: 1.8;
          color: #1a1a1a;
          font-size: 11pt;
        }
        h1 { font-size: 18pt; text-align: center; margin-bottom: 20px; }
        h2 { font-size: 14pt; border-bottom: 2px solid #333; padding-bottom: 5px; margin-top: 25px; }
        h3 { font-size: 12pt; margin: 15px 0 8px; }
        p { margin: 8px 0; text-align: justify; }
        ul { margin: 8px 0 8px 20px; }
        li { margin: 4px 0; }
        strong { font-weight: 600; }
        hr { border: none; border-top: 1px solid #ccc; margin: 20px 0; }
        a { color: #0066cc; text-decoration: none; }
        @page { margin: 25mm; }
      </style>
    </head>
    <body>
      ${bodyContent}
    </body>
    </html>
  `
}

/**
 * Extract plain text from Markdown (removes formatting)
 * @param markdown - Markdown string
 * @returns Plain text string
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,3}\s+/gm, '') // Headers
    .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
    .replace(/\*(.*?)\*/g, '$1') // Italic
    .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
    .replace(/^-\s+/gm, '• ') // Lists
    .replace(/^---$/gm, '---') // HR
    .trim()
}
