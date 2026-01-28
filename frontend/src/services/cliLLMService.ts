/**
 * CLI LLM Service - Wraps Electron IPC to use CLI tools (Claude Code, Gemini CLI)
 * for LLM generation instead of API calls.
 */
import { startCLI, subscribeCLIOutput, stopCLI } from '@/lib/electron'
import { isElectron } from '@/lib/electron'
import type { CLIType, OutputData } from '@/lib/electron'

const CLI_TIMEOUT_MS = 120_000

interface CLIGenerateResult {
  content: string
  success: boolean
  error?: string
  tokens?: number
}

/**
 * Generate text using a CLI tool (Claude Code or Gemini CLI).
 * Only works in Electron. Returns the CLI output as a string.
 */
export async function generateWithCLI(
  prompt: string,
  cli: CLIType = 'claude_code'
): Promise<CLIGenerateResult> {
  if (!isElectron()) {
    return {
      content: '',
      success: false,
      error: 'CLI mode is only available in the desktop app',
    }
  }

  const cliCommand = cli === 'claude_code' ? 'claude' : 'gemini'

  try {
    // Start CLI process with the prompt as an argument
    const sessionId = await startCLI({
      tool: cli,
      cwd: process.cwd?.() || '.',
      args: ['-p', prompt, '--output-format', 'json'],
    })

    if (!sessionId) {
      return {
        content: '',
        success: false,
        error: `Failed to start ${cliCommand} CLI`,
      }
    }

    // Collect output and parse tokens
    const result = await collectOutput(sessionId, cli)
    if (result.success && result.content) {
      const parsed = extractContentAndTokens(result.content, cli)
      return { ...result, content: parsed.content, tokens: parsed.tokens }
    }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CLI error'
    return {
      content: '',
      success: false,
      error: `CLI execution failed: ${message}`,
    }
  }
}

/**
 * Collect CLI output until process completes or times out.
 */
function collectOutput(sessionId: string, _cli: CLIType): Promise<CLIGenerateResult> {
  return new Promise((resolve) => {
    const chunks: string[] = []
    let resolved = false

    const cleanup = () => {
      if (unsubscribe) unsubscribe()
      clearTimeout(timer)
    }

    const finish = (result: CLIGenerateResult) => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve(result)
    }

    // Subscribe to output
    const unsubscribe = subscribeCLIOutput(sessionId, (data: OutputData) => {
      if (data.type === 'stdout') {
        chunks.push(data.data)
      } else if (data.type === 'system') {
        // System messages indicate process state changes
        if (data.data.includes('exited') || data.data.includes('completed') || data.data.includes('stopped')) {
          const content = chunks.join('').trim()
          finish({
            content,
            success: content.length > 0,
            error: content.length === 0 ? 'CLI produced no output' : undefined,
          })
        } else if (data.data.includes('error') || data.data.includes('failed')) {
          finish({
            content: chunks.join('').trim(),
            success: false,
            error: data.data,
          })
        }
      }
    })

    // Timeout
    const timer = setTimeout(async () => {
      try {
        await stopCLI(sessionId)
      } catch {
        // Ignore stop errors
      }
      finish({
        content: chunks.join('').trim(),
        success: false,
        error: `CLI timed out after ${CLI_TIMEOUT_MS / 1000}s`,
      })
    }, CLI_TIMEOUT_MS)
  })
}

/**
 * Extract content and token count from CLI JSON output.
 * Claude: { result, usage: { input_tokens, output_tokens } }
 * Gemini: { response, stats: { models: { "model-name": { tokens: { total } } } } }
 */
function extractContentAndTokens(
  raw: string,
  cli: CLIType
): { content: string; tokens: number } {
  try {
    const data = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) {
      return { content: raw, tokens: 0 }
    }

    if (cli === 'claude_code' && 'result' in data) {
      const content = typeof data.result === 'string' ? data.result : String(data.result)
      const usage = data.usage || {}
      const tokens = (usage.input_tokens || 0) + (usage.output_tokens || 0)
      return { content, tokens }
    }

    if ('response' in data) {
      const content = typeof data.response === 'string' ? data.response : String(data.response)
      const models = data.stats?.models || {}
      let tokens = 0
      for (const modelData of Object.values(models)) {
        tokens += (modelData as any).tokens?.total || 0
      }
      return { content, tokens }
    }

    return { content: raw, tokens: 0 }
  } catch {
    return { content: raw, tokens: 0 }
  }
}

/**
 * Try to parse JSON from CLI output, falling back to raw text.
 */
export function parseCliOutput(content: string): Record<string, unknown> | string {
  try {
    // Try to find JSON in the output
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // Not JSON, return as-is
  }
  return content
}
