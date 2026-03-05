/**
 * Centralized enum constants for the Autopolio frontend.
 * Uses `as const` pattern for type-safe string unions.
 */

// --- LLM Providers ---
export const LLM_PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
} as const

export type LLMProviderType = (typeof LLM_PROVIDERS)[keyof typeof LLM_PROVIDERS]

// --- CLI Types ---
export const CLI_TYPES = {
  CLAUDE_CODE: 'claude_code',
  GEMINI_CLI: 'gemini_cli',
  CODEX_CLI: 'codex_cli',
} as const

export type CLIType = (typeof CLI_TYPES)[keyof typeof CLI_TYPES]

// --- AI Modes ---
export const AI_MODES = {
  CLI: 'cli',
  API: 'api',
} as const

export type AIMode = (typeof AI_MODES)[keyof typeof AI_MODES]

// --- Job Status ---
export const JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const

export type JobStatusType = (typeof JOB_STATUS)[keyof typeof JOB_STATUS]

// --- User Tiers ---
export const USER_TIERS = {
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
} as const

export type UserTierType = (typeof USER_TIERS)[keyof typeof USER_TIERS]

// --- Document Formats ---
export const DOCUMENT_FORMATS = {
  DOCX: 'docx',
  PDF: 'pdf',
  MD: 'md',
  HTML: 'html',
} as const

export type DocumentFormatType = (typeof DOCUMENT_FORMATS)[keyof typeof DOCUMENT_FORMATS]
