/// <reference types="vite/client" />
/// <reference path="./types/electron.d.ts" />


declare const __RUNTIME_CONFIG__: {
  ports?: {
    external?: { frontend?: number; backend?: number }
    docker?: { frontend?: number; backend?: number }
  }
}
