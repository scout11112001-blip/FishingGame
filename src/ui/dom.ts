export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

export function button(className: string, text: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text)
  b.type = 'button'
  b.addEventListener('click', onClick)
  return b
}

/**
 * Карточка предмета в списке панели: заголовок с меткой «выбрано», описание, дальше — что добавит вызывающий.
 * Без onClick — не кнопка, а просто блок: в неё можно положить свою кнопку (кнопка в кнопке не работает).
 */
export function card(name: string, description: string | undefined, selectedLabel: string | null, onClick: (() => void) | null): HTMLElement {
  const className = selectedLabel ? 'sheet-card selected' : 'sheet-card'
  const c = onClick ? button(className, '', onClick) : el('div', className)
  const title = el('div', 'sheet-card-title')
  title.append(el('span', 'sheet-card-name', name))
  if (selectedLabel) title.append(el('span', 'sheet-badge', selectedLabel))
  c.append(title)
  if (description) c.append(el('div', 'sheet-card-desc', description))
  return c
}
