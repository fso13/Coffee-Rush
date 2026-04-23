import type { Content, IngredientId, OrderCard, UpgradeId } from './types'

const INGREDIENTS: IngredientId[] = [
  'coffee',
  'milk',
  'steam',
  'ice',
  'chocolate',
  'caramel',
  'tea',
  'water',
]

function makeCard(id: string, name: string, ingredients: IngredientId[]): OrderCard {
  return { id, name, ingredients }
}

function ingredientLabelRu(i: IngredientId): string {
  switch (i) {
    case 'coffee':
      return 'кофе'
    case 'milk':
      return 'молоко'
    case 'steam':
      return 'пар'
    case 'ice':
      return 'лёд'
    case 'chocolate':
      return 'шоколад'
    case 'caramel':
      return 'карамель'
    case 'tea':
      return 'чай'
    case 'water':
      return 'вода'
  }
}

function ruNameFromIngredients(ingredients: IngredientId[]): string {
  const key = [...ingredients].sort().join('+')
  const named: Record<string, string> = {
    'coffee+milk+steam': 'Латте',
    'coffee+water+steam': 'Американо',
    'coffee+milk+chocolate': 'Мокка',
    'coffee+ice+milk': 'Айс-латте',
    'tea+water+steam': 'Горячий чай',
    'tea+ice+water': 'Айс-ти',
    'chocolate+milk+steam': 'Горячий шоколад',
    'coffee+milk+caramel': 'Карамельный латте',
    'coffee+milk': 'Кофе с молоком',
    'coffee+water': 'Черный кофе',
    'tea+water': 'Чай',
    'chocolate+milk': 'Какао',
  }
  const direct = named[key]
  if (direct) return direct

  // Fallback: human readable composition name (no numbering).
  const parts = ingredients.map(ingredientLabelRu)
  const base = parts[0] ?? 'напиток'
  const rest = parts.slice(1)
  if (rest.length === 0) return base[0]!.toUpperCase() + base.slice(1)
  return `${base[0]!.toUpperCase() + base.slice(1)} с ${rest.join(' + ')}`
}

// MVP deck: procedural set of 2–4 ingredient orders.
// NOTE: This is placeholder content. Swap to real card list later by editing this file only.
function makeDeck(): OrderCard[] {
  const cards: OrderCard[] = []

  let seq = 1
  const push = (ingredients: IngredientId[]) => {
    const name = ruNameFromIngredients(ingredients)
    cards.push(makeCard(`c${seq}`, name, ingredients))
    seq++
  }

  // Curated small set to keep gameplay readable.
  const curated: IngredientId[][] = [
    ['coffee', 'milk'],
    ['coffee', 'water'],
    ['tea', 'water'],
    ['chocolate', 'milk'],
    ['coffee', 'milk', 'steam'],
    ['coffee', 'water', 'steam'],
    ['tea', 'water', 'steam'],
    ['tea', 'ice', 'water'],
    ['coffee', 'ice', 'milk'],
    ['coffee', 'milk', 'chocolate'],
    ['chocolate', 'milk', 'steam'],
    ['coffee', 'milk', 'caramel'],
    ['coffee', 'chocolate', 'water', 'steam'],
    ['coffee', 'caramel', 'milk', 'steam'],
    ['tea', 'milk', 'steam'],
    ['coffee', 'ice', 'caramel'],
  ]

  // Repeat to roughly match the tabletop deck size feel.
  for (let i = 0; i < 5; i++) {
    for (const recipe of curated) push(recipe)
  }

  // Add some extra random-ish 2–4 ingredient cards to reach ~80.
  while (cards.length < 80) {
    const len = 2 + (cards.length % 3) // 2,3,4 repeating
    const ing: IngredientId[] = []
    for (let i = 0; i < len; i++) ing.push(INGREDIENTS[(cards.length + i * 3) % INGREDIENTS.length])
    push(ing)
  }

  return cards
}

export function createDefaultContent(): Content {
  const upgrades: Content['upgrades'] = [
    {
      id: 'diagonalMove' satisfies UpgradeId,
      name: 'Диагональное движение',
      description: 'Можно двигаться по диагонали (в дополнение к обычным ходам).',
    },
    {
      id: 'doubleCorner' satisfies UpgradeId,
      name: 'Бонус углов',
      description: 'Если вы заходите в угловую клетку — берёте 2 ингредиента вместо 1.',
    },
    {
      id: 'doubleSpecialCell' satisfies UpgradeId,
      name: 'Бонус спец-клеток',
      description: 'Если вы заходите на спец-клетку — берёте 2 ингредиента вместо 1.',
    },
  ]

  return {
    boardLayout: [
      ['ice', 'caramel', 'steam', 'coffee'],
      ['coffee', 'milk', 'ice', 'water'],
      ['tea', 'steam', 'milk', 'coffee'],
      ['milk', 'ice', 'chocolate', 'steam'],
    ],
    specialCells: [
      { r: 0, c: 1 },
      { r: 1, c: 3 },
      { r: 2, c: 0 },
      { r: 3, c: 2 },
    ],
    deck: makeDeck(),
    upgrades,
  }
}

