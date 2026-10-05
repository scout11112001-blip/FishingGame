interface ImportMetaEnv {
  /** 'true' — тестовая версия со всем открытым контентом (см. sandbox.ts). */
  readonly VITE_SANDBOX?: string
  /** 'true' — отладочные команды в консоли и в сборке (см. debug.ts). */
  readonly VITE_DEBUG?: string
}
