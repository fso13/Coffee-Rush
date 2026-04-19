import type { IngredientId } from './types'

function svgToDataUri(svg: string): string {
  const cleaned = svg.replace(/\s+/g, ' ').trim()
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cleaned)}`
}

function ingredientColor(id: IngredientId): string {
  switch (id) {
    case 'coffee':
      return '#7c4a2d'
    case 'milk':
      return '#f4f1ff'
    case 'steam':
      return '#cbd5e1'
    case 'ice':
      return '#7dd3fc'
    case 'chocolate':
      return '#4c2a1a'
    case 'caramel':
      return '#f59e0b'
    case 'tea':
      return '#34d399'
    case 'water':
      return '#60a5fa'
  }
}

export function ingredientLabelRu(id: IngredientId): string {
  switch (id) {
    case 'coffee':
      return 'Кофе'
    case 'milk':
      return 'Молоко'
    case 'steam':
      return 'Пар'
    case 'ice':
      return 'Лёд'
    case 'chocolate':
      return 'Шоколад'
    case 'caramel':
      return 'Карамель'
    case 'tea':
      return 'Чай'
    case 'water':
      return 'Вода'
  }
}

export function ingredientIconDataUri(id: IngredientId): string {
  const c = ingredientColor(id)
  // Simple “pixel-ish” icon: rounded tile + glyph.
  const glyph = (() => {
    switch (id) {
      case 'coffee':
        return '☕'
      case 'milk':
        return '🥛'
      case 'steam':
        return '♨'
      case 'ice':
        return '🧊'
      case 'chocolate':
        return '🍫'
      case 'caramel':
        return '🍯'
      case 'tea':
        return '🍵'
      case 'water':
        return '💧'
    }
  })()

  return svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${c}" stop-opacity="0.95"/>
          <stop offset="1" stop-color="${c}" stop-opacity="0.65"/>
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="52" height="52" rx="14" fill="url(#g)"/>
      <rect x="6" y="6" width="52" height="52" rx="14" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>
      <text x="32" y="40" text-anchor="middle" font-size="26" font-family="system-ui,Segoe UI,Apple Color Emoji,Noto Color Emoji">${glyph}</text>
    </svg>
  `)
}

export function drinkIconDataUri(ingredients: ReadonlyArray<IngredientId>): string {
  // Deterministic accent based on ingredients.
  const key = [...ingredients].sort().join('|')
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  const hue = h % 360
  const accent = `hsl(${hue} 80% 65%)`

  return svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="6" y="6" width="52" height="52" rx="14" fill="rgba(255,255,255,0.06)"/>
      <rect x="6" y="6" width="52" height="52" rx="14" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"/>
      <path d="M22 24h20v18a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6V24z" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
      <path d="M42 28h3a5 5 0 0 1 0 10h-3" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
      <path d="M24 30h16v10a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V30z" fill="${accent}" fill-opacity="0.55"/>
      <circle cx="32" cy="22" r="3" fill="${accent}" fill-opacity="0.9"/>
    </svg>
  `)
}

