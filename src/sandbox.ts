/**
 * Тестовая версия: npm run dev:sandbox (или build:sandbox). Режим сборки sandbox включает переменную из .env.sandbox.
 * В ней с самого начала открыты все водоёмы и куплены все снасти, а достижения засчитываются как обычно.
 * В обычную сборку не попадает: там переменной нет, и все проверки SANDBOX вырезаются.
 */
export const SANDBOX = import.meta.env.VITE_SANDBOX === 'true'
