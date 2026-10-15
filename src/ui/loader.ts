/**
 * Экран загрузки из index.html: он виден с первой секунды, ещё до кода игры, и показывает полоску прогресса,
 * пока грузятся площадка, сохранение и картинки (требование ВК: долгая загрузка — с индикатором). Как только
 * игра готова, плавно исчезает.
 */

/** Сколько загружено, 0..1. */
export function setLoadProgress(progress: number): void {
  const fill = document.getElementById('loader-fill')
  if (fill) fill.style.width = `${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%`
}

export function hideLoader(): void {
  const loader = document.getElementById('loader')
  if (!loader) return
  setLoadProgress(1)
  loader.classList.add('done')
  setTimeout(() => loader.remove(), 400)
}
