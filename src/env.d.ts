interface ImportMetaEnv {
  /** 'true' — тестовая версия со всем открытым контентом (см. sandbox.ts). */
  readonly VITE_SANDBOX?: string
  /** 'true' — отладочные команды в консоли и в сборке (см. debug.ts). */
  readonly VITE_DEBUG?: string
  /** 'vk' — сборка для ВКонтакте и Одноклассников (см. platform/target.ts); нет — для Яндекс Игр. */
  readonly VITE_TARGET?: string
  /** Ссылка «Поддержка» в главном меню — сообщество игры (.env.vk). */
  readonly VITE_SUPPORT_URL?: string
}
