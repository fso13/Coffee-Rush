import type { Content, Coord, DifficultyId, GameState, IngredientId, OrderCard, UpgradeId } from './types'
import { createRng, shuffleInPlace } from './rng'

export type CreateGameArgs = Readonly<{
  content: Content
  seed: number
  difficulty?: DifficultyId
}>

export const DIFFICULTY_LABELS: Record<DifficultyId, string> = {
  intern: 'Стажер',
  barista: 'Бариста',
  burned: 'Прожженый',
}

export const ORDER_SPAWN_COEFFICIENT: Record<DifficultyId, number> = {
  intern: 0.75,
  barista: 1,
  burned: 1.5,
}

export function getScore(s: GameState): number {
  const done = [...s.completed, ...s.discardCompleted]
  return done.reduce((sum, card) => sum + card.ingredients.length, 0)
}

export type GameAction = Readonly<{
  kind: string
  reduce: (s: GameState) => GameState
}>

function clampCoord(layout: Content['boardLayout'], coord: Coord): Coord {
  const r = Math.max(0, Math.min(layout.length - 1, coord.r))
  const c = Math.max(0, Math.min(layout[0]!.length - 1, coord.c))
  return { r, c }
}

function isCoordEqual(a: Coord, b: Coord): boolean {
  return a.r === b.r && a.c === b.c
}

function isSpecialCell(content: Content, coord: Coord): boolean {
  return content.specialCells.some((x) => isCoordEqual(x, coord))
}

function isCorner(layout: Content['boardLayout'], coord: Coord): boolean {
  const maxR = layout.length - 1
  const maxC = layout[0]!.length - 1
  return (
    (coord.r === 0 && coord.c === 0) ||
    (coord.r === 0 && coord.c === maxC) ||
    (coord.r === maxR && coord.c === 0) ||
    (coord.r === maxR && coord.c === maxC)
  )
}

function canStep(from: Coord, to: Coord, diagonal: boolean): boolean {
  const dr = Math.abs(to.r - from.r)
  const dc = Math.abs(to.c - from.c)
  if (dr === 0 && dc === 0) return false
  if (diagonal) return dr <= 1 && dc <= 1
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
}

function addLog(s: GameState, line: string): GameState {
  const next = [line, ...s.log].slice(0, 40)
  return { ...s, log: next }
}

function drawFromDeck(s: GameState, count: number): { state: GameState; drawn: OrderCard[] } {
  const deck = s.content.deck
  const start = s.deckCursor
  const end = Math.min(deck.length, start + count)
  const drawn = deck.slice(start, end)
  return { state: { ...s, deckCursor: end }, drawn }
}

function sameIngredients(a: ReadonlyArray<IngredientId>, b: ReadonlyArray<IngredientId>): boolean {
  if (a.length !== b.length) return false
  const aa = [...a].sort()
  const bb = [...b].sort()
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false
  return true
}

function isBlackCoffee(card: OrderCard): boolean {
  return sameIngredients(card.ingredients, ['coffee', 'water'])
}

function takeFirstCard(deck: OrderCard[], predicate: (card: OrderCard) => boolean): OrderCard | null {
  const idx = deck.findIndex(predicate)
  if (idx < 0) return null
  const [card] = deck.splice(idx, 1)
  return card ?? null
}

function takeFirstRandomCard(deck: OrderCard[]): OrderCard | null {
  const [card] = deck.splice(0, 1)
  return card ?? null
}

function takeRandomNonBlack(deck: OrderCard[]): OrderCard | null {
  const card = takeFirstCard(deck, (x) => !isBlackCoffee(x))
  if (card) return card
  return takeFirstRandomCard(deck)
}

function makeInitialTabs(deck: OrderCard[], difficulty: DifficultyId): GameState['tabs'] {
  const tab1: OrderCard[] = []
  const tab2: OrderCard[] = []
  const takeBlack = () => takeFirstCard(deck, isBlackCoffee) ?? takeFirstRandomCard(deck)
  const takeRandom = () => takeRandomNonBlack(deck)

  if (difficulty === 'intern') {
    const black = takeBlack()
    if (black) tab1.push(black)
  } else if (difficulty === 'barista') {
    const random = takeRandom()
    const black = takeBlack()
    if (random) tab1.push(random)
    if (black) tab2.push(black)
  } else {
    const random1 = takeRandom()
    const random2 = takeRandom()
    const black = takeBlack()
    if (random1) tab1.push(random1)
    if (random2) tab1.push(random2)
    if (black) tab2.push(black)
  }

  return { tab1, tab2, tab3: [], tab4: [] }
}

function removeCardById(cards: ReadonlyArray<OrderCard>, id: string): OrderCard[] {
  const idx = cards.findIndex((c) => c.id === id)
  if (idx < 0) return [...cards]
  return [...cards.slice(0, idx), ...cards.slice(idx + 1)]
}

function pickCardById(cards: ReadonlyArray<OrderCard>, id: string): OrderCard | null {
  return cards.find((c) => c.id === id) ?? null
}

function sameMultiset(a: ReadonlyArray<IngredientId>, b: ReadonlyArray<IngredientId>): boolean {
  if (a.length !== b.length) return false
  const aa = [...a].sort()
  const bb = [...b].sort()
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false
  return true
}

function withCupIngredients(s: GameState, cupIdx: 0 | 1 | 2, ingredients: IngredientId[]): GameState['cups'] {
  const c0 = cupIdx === 0 ? { ingredients } : { ingredients: [...s.cups[0].ingredients] }
  const c1 = cupIdx === 1 ? { ingredients } : { ingredients: [...s.cups[1].ingredients] }
  const c2 = cupIdx === 2 ? { ingredients } : { ingredients: [...s.cups[2].ingredients] }
  return [c0, c1, c2]
}

export function createGame(args: CreateGameArgs): GameState {
  const rng = createRng(args.seed)
  const difficulty = args.difficulty ?? 'barista'
  const deck = [...args.content.deck]
  shuffleInPlace(deck, rng)
  const tabs = makeInitialTabs(deck, difficulty)

  const content: Content = { ...args.content, deck }

  const base: GameState = {
    seed: args.seed,
    phase: 'setup',
    difficulty,
    content,
    meeple: { r: 0, c: 0 },
    rushTokens: 0,
    penalties: [],
    completed: [],
    discardCompleted: [],
    activeUpgrades: [],
    tabs,
    deckCursor: 0,
    move: { stepsMax: 3, stepsLeft: 3, collectedThisTurn: [] },
    setup: { selectedStartCup: 0 },
    cups: [{ ingredients: [] }, { ingredients: [] }, { ingredients: [] }],
    pour: { selectedCollectedIdx: null },
    process: { completedThisTurn: 0 },
    log: [],
  }

  let s = base

  // Clamp default position; player will choose the actual starting cell during setup.
  s = { ...s, meeple: clampCoord(s.content.boardLayout, s.meeple) }

  return addLog(s, 'Игра началась. Выберите стартовую клетку и чашку для первого ингредиента.')
}

export const Actions = {
  undo: (): GameAction => ({
    kind: 'undo',
    reduce: (s) => s,
  }),

  restart: (args: CreateGameArgs): GameAction => ({
    kind: 'restart',
    reduce: () => createGame(args),
  }),

  chooseStartCup: (cupIdx: 0 | 1 | 2): GameAction => ({
    kind: 'chooseStartCup',
    reduce: (s) => {
      if (s.phase !== 'setup') return s
      return { ...s, setup: { selectedStartCup: cupIdx } }
    },
  }),

  setDifficulty: (difficulty: DifficultyId): GameAction => ({
    kind: 'setDifficulty',
    reduce: (s) => ({ ...s, difficulty }),
  }),

  placeStartMeeple: (to: Coord): GameAction => ({
    kind: 'placeStartMeeple',
    reduce: (s) => {
      if (s.phase !== 'setup') return s
      const clamped = clampCoord(s.content.boardLayout, to)
      if (!isCoordEqual(clamped, to)) return s

      const ing = s.content.boardLayout[to.r]![to.c]!
      const cupIdx = s.setup.selectedStartCup
      const nextCups = withCupIngredients(s, cupIdx, [...s.cups[cupIdx].ingredients, ing])

      const next: GameState = {
        ...s,
        phase: 'move',
        meeple: to,
        cups: nextCups,
        move: { ...s.move, stepsMax: 3, stepsLeft: 3, collectedThisTurn: [] },
      }
      return addLog(next, `Старт: бариста в (${to.r},${to.c}), ${ing} отправлен в чашку ${cupIdx + 1}.`)
    },
  }),

  activateUpgrade: (upgradeId: UpgradeId): GameAction => ({
    kind: 'activateUpgrade',
    reduce: (s) => {
      if (s.phase === 'gameover') return s
      if (s.activeUpgrades.includes(upgradeId)) return s
      if (s.completed.length < 3) return s
      const paid = s.completed.slice(0, 3)
      const remaining = s.completed.slice(3)
      const next: GameState = {
        ...s,
        completed: remaining,
        discardCompleted: [...paid, ...s.discardCompleted],
        activeUpgrades: [...s.activeUpgrades, upgradeId],
      }
      return addLog(next, `Улучшение активировано: ${upgradeId}`)
    },
  }),

  spendRush: (): GameAction => ({
    kind: 'spendRush',
    reduce: (s) => {
      if (s.phase !== 'move') return s
      if (s.rushTokens <= 0) return s
      const next: GameState = {
        ...s,
        rushTokens: s.rushTokens - 1,
        move: { ...s.move, stepsLeft: s.move.stepsLeft + 1, stepsMax: s.move.stepsMax + 1 },
      }
      return addLog(next, 'Потрачен 1 Rush-жетон: +1 шаг.')
    },
  }),

  moveTo: (to: Coord): GameAction => ({
    kind: 'moveTo',
    reduce: (s) => {
      if (s.phase !== 'move') return s
      if (s.move.stepsLeft <= 0) return s

      const diagonal = s.activeUpgrades.includes('diagonalMove')
      if (!canStep(s.meeple, to, diagonal)) return s

      const layout = s.content.boardLayout
      const clamped = clampCoord(layout, to)
      if (!isCoordEqual(clamped, to)) return s

      const baseIngredient = layout[to.r]![to.c]!
      let gained: IngredientId[] = [baseIngredient]

      if (s.activeUpgrades.includes('doubleCorner') && isCorner(layout, to)) gained = [baseIngredient, baseIngredient]
      if (s.activeUpgrades.includes('doubleSpecialCell') && isSpecialCell(s.content, to))
        gained = [baseIngredient, baseIngredient]

      const next: GameState = {
        ...s,
        meeple: to,
        move: {
          ...s.move,
          stepsLeft: s.move.stepsLeft - 1,
          collectedThisTurn: [...s.move.collectedThisTurn, ...gained],
        },
      }

      return addLog(next, `Ход в (${to.r},${to.c}). Собрано: ${gained.join(', ')}.`)
    },
  }),

  finishMove: (): GameAction => ({
    kind: 'finishMove',
    reduce: (s) => {
      if (s.phase !== 'move') return s
      return addLog({ ...s, phase: 'pour', pour: { selectedCollectedIdx: null } }, 'Фаза движения завершена.')
    },
  }),

  selectCollected: (idx: number | null): GameAction => ({
    kind: 'selectCollected',
    reduce: (s) => {
      if (s.phase !== 'pour') return s
      if (idx === null) return { ...s, pour: { selectedCollectedIdx: null } }
      if (idx < 0 || idx >= s.move.collectedThisTurn.length) return s
      return { ...s, pour: { selectedCollectedIdx: idx } }
    },
  }),

  discardCollected: (idx: number): GameAction => ({
    kind: 'discardCollected',
    reduce: (s) => {
      if (s.phase !== 'pour') return s
      if (idx < 0 || idx >= s.move.collectedThisTurn.length) return s
      const nextCollected = [...s.move.collectedThisTurn]
      const [removed] = nextCollected.splice(idx, 1)
      const nextSelected =
        s.pour.selectedCollectedIdx === null
          ? null
          : s.pour.selectedCollectedIdx === idx
            ? null
            : s.pour.selectedCollectedIdx > idx
              ? s.pour.selectedCollectedIdx - 1
              : s.pour.selectedCollectedIdx
      return addLog(
        { ...s, move: { ...s.move, collectedThisTurn: nextCollected }, pour: { selectedCollectedIdx: nextSelected } },
        `Сброшено: ${removed}.`,
      )
    },
  }),

  pourToCup: (cupIdx: 0 | 1 | 2): GameAction => ({
    kind: 'pourToCup',
    reduce: (s) => {
      if (s.phase !== 'pour') return s
      const idx = s.pour.selectedCollectedIdx
      if (idx === null) return s
      if (idx < 0 || idx >= s.move.collectedThisTurn.length) return s
      const ing = s.move.collectedThisTurn[idx]!

      const nextCollected = [...s.move.collectedThisTurn]
      nextCollected.splice(idx, 1)
      const nextCupIngredients = [...s.cups[cupIdx].ingredients, ing]
      const nextCups = withCupIngredients(s, cupIdx, nextCupIngredients)

      return addLog(
        {
          ...s,
          cups: nextCups,
          move: { ...s.move, collectedThisTurn: nextCollected },
          pour: { selectedCollectedIdx: null },
        },
        `Разлито в чашку ${cupIdx + 1}: ${ing}.`,
      )
    },
  }),

  pourCollectedIdxToCup: (cupIdx: 0 | 1 | 2, collectedIdx: number): GameAction => ({
    kind: 'pourCollectedIdxToCup',
    reduce: (s) => {
      if (s.phase !== 'pour') return s
      if (collectedIdx < 0 || collectedIdx >= s.move.collectedThisTurn.length) return s

      const ing = s.move.collectedThisTurn[collectedIdx]!
      const nextCollected = [...s.move.collectedThisTurn]
      nextCollected.splice(collectedIdx, 1)

      const nextCupIngredients = [...s.cups[cupIdx].ingredients, ing]
      const nextCups = withCupIngredients(s, cupIdx, nextCupIngredients)

      return addLog(
        {
          ...s,
          cups: nextCups,
          move: { ...s.move, collectedThisTurn: nextCollected },
          pour: { selectedCollectedIdx: null },
        },
        `Разлито в чашку ${cupIdx + 1}: ${ing}.`,
      )
    },
  }),

  emptyCup: (cupIdx: 0 | 1 | 2): GameAction => ({
    kind: 'emptyCup',
    reduce: (s) => {
      if (s.phase !== 'pour' && s.phase !== 'process') return s
      if (s.cups[cupIdx].ingredients.length === 0) return s
      const nextCups = withCupIngredients(s, cupIdx, [])
      return addLog({ ...s, cups: nextCups }, `Чашка ${cupIdx + 1} очищена.`)
    },
  }),

  finishPour: (): GameAction => ({
    kind: 'finishPour',
    reduce: (s) => {
      if (s.phase !== 'pour') return s
      const next: GameState = {
        ...s,
        phase: 'process',
        pour: { selectedCollectedIdx: null },
        process: { completedThisTurn: 0 },
      }
      return addLog(next, 'Фаза разлива завершена.')
    },
  }),

  fulfillFromTab: (
    tab: keyof GameState['tabs'],
    cardId: string,
    cupIdx: 0 | 1 | 2,
  ): GameAction => ({
    kind: 'fulfillFromTab',
    reduce: (s) => {
      if (s.phase !== 'process') return s
      const card = pickCardById(s.tabs[tab], cardId)
      if (!card) return s
      const cup = s.cups[cupIdx]
      if (!sameMultiset(cup.ingredients, card.ingredients)) return s

      const nextTabs = { ...s.tabs, [tab]: removeCardById(s.tabs[tab], cardId) }
      const nextCups = withCupIngredients(s, cupIdx, [])

      const next: GameState = {
        ...s,
        tabs: nextTabs,
        cups: nextCups,
        completed: [card, ...s.completed],
        process: { completedThisTurn: s.process.completedThisTurn + 1 },
      }
      return addLog(next, `Заказ выполнен: «${card.name}» (☕${cupIdx + 1}).`)
    },
  }),

  finishProcess: (): GameAction => ({
    kind: 'finishProcess',
    reduce: (s) => {
      if (s.phase !== 'process') return s
      const k = s.process.completedThisTurn
      return addLog({ ...s, phase: 'time' }, `Фаза обработки завершена. Выполнено за ход: ${k}.`)
    },
  }),

  resolveTime: (): GameAction => ({
    kind: 'resolveTime',
    reduce: (s) => {
      if (s.phase !== 'time') return s

      const fellOff = s.tabs.tab4
      const nextPenalties = [...fellOff, ...s.penalties]
      const newRush = fellOff.length

      const nextTabs: GameState['tabs'] = {
        tab4: s.tabs.tab3,
        tab3: s.tabs.tab2,
        tab2: s.tabs.tab1,
        tab1: [],
      }

      let next: GameState = {
        ...s,
        tabs: nextTabs,
        penalties: nextPenalties,
        rushTokens: s.rushTokens + newRush,
        phase: nextPenalties.length >= 5 ? 'gameover' : 'move',
        move: { stepsMax: 3, stepsLeft: 3, collectedThisTurn: [] },
        pour: { selectedCollectedIdx: null },
        process: { completedThisTurn: 0 },
      }

      next = addLog(next, `Время прошло. Штрафы +${fellOff.length}. Rush +${newRush}.`)

      if (next.phase === 'gameover') return addLog(next, 'Игра окончена: получено 5 штрафов.')

      // ВАЖНО: добор должен происходить после сдвига заказов (после nextTabs).
      const k = s.process.completedThisTurn
      if (k > 0) {
        const coeff = ORDER_SPAWN_COEFFICIENT[s.difficulty]
        const drawCount = Math.max(1, Math.round(2 * k * coeff))
        const res = drawFromDeck(next, drawCount)
        next = res.state
        next = { ...next, tabs: { ...next.tabs, tab1: [...res.drawn, ...next.tabs.tab1] } }
        next = addLog(next, `Соло-добор: +${res.drawn.length}/${drawCount} карт в Таб 1 (коэф. ${coeff}).`)
      }

      return addLog(next, 'Новый ход: фаза движения.')
    },
  }),
} as const

