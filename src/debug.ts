/**
 * Отладочные команды в консоли браузера (__fishing, __game, __platform, __resetSave): на сервере разработки
 * и в отладочной сборке (npm run yandex — режим debug, переменная из .env.debug). В обычную сборку не попадают.
 */
export const DEBUG = import.meta.env.DEV || import.meta.env.VITE_DEBUG === 'true'
