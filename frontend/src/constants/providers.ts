import { LLM_PROVIDERS, CLI_TYPES } from './enums'

export const PROVIDER_META: Record<string, { label: string; color: string }> = {
  [LLM_PROVIDERS.OPENAI]: { label: 'OpenAI', color: 'bg-green-500' },
  [LLM_PROVIDERS.ANTHROPIC]: { label: 'Anthropic', color: 'bg-orange-500' },
  [LLM_PROVIDERS.GEMINI]: { label: 'Gemini', color: 'bg-blue-500' },
  [CLI_TYPES.CLAUDE_CODE]: { label: 'Claude CLI', color: 'bg-orange-400' },
  [CLI_TYPES.GEMINI_CLI]: { label: 'Gemini CLI', color: 'bg-blue-400' },
  [CLI_TYPES.CODEX_CLI]: { label: 'Codex CLI', color: 'bg-yellow-500' },
  // Usage store key alias (differs from CLI_TYPES.CLAUDE_CODE)
  claude_code_cli: { label: 'Claude CLI', color: 'bg-orange-400' },
}
