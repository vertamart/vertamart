/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_DATA_SOURCE?: 'mock' | 'api'
  readonly VITE_API_TOKEN?: string
  readonly VITE_DESKTOP_DOWNLOAD_URL?: string
  readonly VITE_ANDROID_DOWNLOAD_URL?: string
}
