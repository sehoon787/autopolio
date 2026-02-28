const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Anthropic
  'claude-sonnet-4-6-20260217': 'Claude Sonnet 4.6',
  'claude-opus-4-6-20260205': 'Claude Opus 4.6',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-opus-4-20250514': 'Claude Opus 4',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  // OpenAI
  'gpt-4.1': 'GPT-4.1',
  'gpt-4.1-mini': 'GPT-4.1 Mini',
  'gpt-4.1-nano': 'GPT-4.1 Nano',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  // Codex CLI
  'default': 'Default',
  'gpt-5.3-codex': 'GPT-5.3 Codex',
  'gpt-5.2-codex': 'GPT-5.2 Codex',
  'gpt-5.1-codex': 'GPT-5.1 Codex',
  // Gemini
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-2.5-pro': 'Gemini 2.5 Pro',
  'gemini-2.0-flash': 'Gemini 2.0 Flash',
}

export function getModelDisplayName(modelId: string): string {
  return MODEL_DISPLAY_NAMES[modelId] || modelId
}
