# Autopolio Frontend

React 19 + TypeScript + Vite frontend for the Autopolio platform. Supports both web deployment and Electron desktop app.

## Architecture

```
frontend/
├── src/
│   ├── api/                # API client modules
│   │   ├── client.ts       # Axios instance + interceptors
│   │   ├── users.ts
│   │   ├── knowledge.ts    # Companies, projects, achievements
│   │   ├── github.ts       # GitHub repos, analysis, import
│   │   ├── llm.ts          # LLM config, CLI status
│   │   ├── templates.ts
│   │   ├── platforms.ts
│   │   ├── documents.ts
│   │   └── pipeline.ts
│   ├── components/         # Shared UI components
│   │   ├── ui/             # Shadcn/ui primitives (Button, Card, etc.)
│   │   ├── icons/          # Custom icons (LLMIcons.tsx)
│   │   ├── CLIStatusCard.tsx
│   │   ├── LLMProviderCard.tsx
│   │   └── Layout.tsx
│   ├── pages/              # Route pages
│   │   ├── Dashboard.tsx
│   │   ├── Setup/          # GitHub connection, data import
│   │   ├── Knowledge/      # Companies, Projects, ProjectDetail tabs
│   │   ├── Templates/      # Template list, editor
│   │   ├── Platforms/      # Platform templates, export, preview
│   │   ├── Generate/       # Pipeline execution
│   │   ├── Documents/      # Generated documents
│   │   └── History.tsx
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand state stores
│   │   ├── userStore.ts
│   │   └── pipelineStore.ts
│   ├── locales/            # i18n translations (en/ko)
│   │   ├── en/             # English (common, settings, github)
│   │   └── ko/             # Korean
│   └── lib/
│       └── utils.ts        # Utility functions (cn, etc.)
├── electron/               # Electron main process
│   ├── main.ts             # Main process entry
│   ├── preload.js          # Preload script (CommonJS)
│   └── services/           # CLI tool manager, agent process manager
├── vite.config.ts
├── electron-builder.json
└── tailwind.config.js
```

## State Management

- **Zustand** for client-side state (user session, pipeline progress)
- **TanStack Query** for server state (API data fetching, caching, mutations)

## i18n

Uses `react-i18next`. Translation files in `src/locales/{en,ko}/`. Language preference is persisted to localStorage.

## Web vs Electron Mode

| Feature | Web | Electron |
|---------|-----|----------|
| CLI tool status | Hidden | Shown (auto-detect Claude Code, Gemini CLI) |
| API key management | Read-only (from `.env`) | Full management (local storage) |
| OAuth callback | Browser redirect | Custom protocol (`autopolio://`) |
| LLM default | Gemini API | CLI (auto-detect, API fallback) |

Feature flags are set via `window.electronAPI` presence detection.

## Development

```bash
# Install dependencies
npm install

# Web dev server
npm run dev

# Electron dev (Vite + Electron)
npm run electron:dev

# Production build
npm run build

# Electron build
npm run electron:build:win   # Windows exe
npm run electron:build:mac   # macOS dmg
npm run electron:build:linux # Linux AppImage
```

Dev server: http://localhost:5173 (Vite) / Backend API: http://localhost:8085
