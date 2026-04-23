import './style.css'
import { createDefaultContent } from './srclib/content'
import { createGame, DIFFICULTY_LABELS, getScore, type GameAction } from './srclib/game'
import type { DifficultyId, GameState } from './srclib/types'
import { renderApp } from './srclib/ui'

const STORAGE_KEY = 'coffee-rush-web:state:v1'
const ACHIEVEMENTS_KEY = 'coffee-rush-web:achievements:v1'
const content = createDefaultContent()

type AchievementEntry = Readonly<{
  id: string
  createdAt: number
  difficulty: DifficultyId
  score: number
}>

function isValidSavedState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false
  const obj = value as Partial<GameState>
  return (
    typeof obj.phase === 'string' &&
    typeof obj.seed === 'number' &&
    (obj.difficulty === 'intern' || obj.difficulty === 'barista' || obj.difficulty === 'burned') &&
    !!obj.content &&
    !!obj.tabs &&
    Array.isArray(obj.cups) &&
    !!obj.move &&
    !!obj.setup &&
    !!obj.pour &&
    !!obj.process &&
    Array.isArray(obj.log)
  )
}

function migrateSavedState(value: unknown): GameState | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Partial<GameState> & { setup?: { selectedStartCup?: number } }
  if (
    typeof obj.phase !== 'string' ||
    typeof obj.seed !== 'number' ||
    !obj.content ||
    !obj.tabs ||
    !Array.isArray(obj.cups) ||
    !obj.move ||
    !obj.pour ||
    !obj.process ||
    !Array.isArray(obj.log)
  ) {
    return null
  }

  const selectedStartCup = obj.setup?.selectedStartCup
  const normalizedCup: 0 | 1 | 2 = selectedStartCup === 1 || selectedStartCup === 2 ? selectedStartCup : 0
  const difficultyRaw = (obj as { difficulty?: string }).difficulty
  const difficulty: DifficultyId =
    difficultyRaw === 'intern' || difficultyRaw === 'burned' || difficultyRaw === 'barista' ? difficultyRaw : 'barista'
  return { ...(obj as GameState), difficulty, setup: { selectedStartCup: normalizedCup } }
}

function loadStateOrCreateNew(): GameState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createGame({ content, seed: Date.now(), difficulty: 'barista' })
    const parsed: unknown = JSON.parse(raw)
    if (isValidSavedState(parsed)) return parsed
    const migrated = migrateSavedState(parsed)
    if (migrated) return migrated
  } catch {
    // ignore and fallback to new game
  }
  return createGame({ content, seed: Date.now(), difficulty: 'barista' })
}

function persistState(nextState: GameState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
  } catch {
    // ignore storage quota/private mode errors
  }
}

function loadAchievements(): AchievementEntry[] {
  try {
    const raw = window.localStorage.getItem(ACHIEVEMENTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is AchievementEntry => {
        if (!x || typeof x !== 'object') return false
        const item = x as Partial<AchievementEntry>
        return (
          typeof item.id === 'string' &&
          typeof item.createdAt === 'number' &&
          typeof item.score === 'number' &&
          (item.difficulty === 'intern' || item.difficulty === 'barista' || item.difficulty === 'burned')
        )
      })
      .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
      .slice(0, 50)
  } catch {
    return []
  }
}

function persistAchievements(items: AchievementEntry[]): void {
  try {
    window.localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(items.slice(0, 50)))
  } catch {
    // ignore storage errors
  }
}

let state = loadStateOrCreateNew()
const history: GameState[] = []
let ratingOpen = false
let achievements = loadAchievements()

const rootNode = document.querySelector<HTMLDivElement>('#app')
if (!rootNode) throw new Error('Missing #app')
const root: HTMLDivElement = rootNode

function rerender(): void {
  renderApp(root, state, dispatch, {
    canUndo: history.length > 0,
    ratingOpen,
    onToggleRating: () => {
      ratingOpen = !ratingOpen
      rerender()
    },
    achievements,
  })
}

const dispatch = (action: GameAction) => {
  if (action.kind === 'undo') {
    const prev = history.pop()
    if (!prev) return
    state = prev
    persistState(state)
    rerender()
    return
  }

  if (action.kind === 'restart') {
    history.length = 0
    state = createGame({ content, seed: Date.now(), difficulty: state.difficulty })
    persistState(state)
    rerender()
    return
  }

  if (action.kind === 'setDifficulty') {
    history.length = 0
    const nextDifficulty = action.reduce(state).difficulty
    state = createGame({ content, seed: Date.now(), difficulty: nextDifficulty })
    persistState(state)
    rerender()
    return
  }

  history.push(state)

  const prevState = state
  state = action.reduce(state)

  if (prevState.phase !== 'gameover' && state.phase === 'gameover') {
    const score = getScore(state)
    const entry: AchievementEntry = {
      id: `${state.seed}:${Date.now()}`,
      createdAt: Date.now(),
      difficulty: state.difficulty,
      score,
    }
    achievements = [entry, ...achievements].sort((a, b) => b.score - a.score || b.createdAt - a.createdAt).slice(0, 50)
    persistAchievements(achievements)
    const difficultyLabel = DIFFICULTY_LABELS[state.difficulty]
    state = { ...state, log: [`Достижение сохранено: ${difficultyLabel}, ${score} очков.`, ...state.log].slice(0, 40) }
  }

  persistState(state)
  rerender()
}

persistState(state)
rerender()
