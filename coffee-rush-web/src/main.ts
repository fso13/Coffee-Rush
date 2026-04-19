import './style.css'
import { createDefaultContent } from './srclib/content'
import { createGame, type GameAction } from './srclib/game'
import type { GameState } from './srclib/types'
import { renderApp } from './srclib/ui'

const STORAGE_KEY = 'coffee-rush-web:state:v1'
const content = createDefaultContent()

function isValidSavedState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false
  const obj = value as Partial<GameState>
  return (
    typeof obj.phase === 'string' &&
    typeof obj.seed === 'number' &&
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
  return { ...(obj as GameState), setup: { selectedStartCup: normalizedCup } }
}

function loadStateOrCreateNew(): GameState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createGame({ content, seed: Date.now() })
    const parsed: unknown = JSON.parse(raw)
    if (isValidSavedState(parsed)) return parsed
    const migrated = migrateSavedState(parsed)
    if (migrated) return migrated
  } catch {
    // ignore and fallback to new game
  }
  return createGame({ content, seed: Date.now() })
}

function persistState(nextState: GameState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
  } catch {
    // ignore storage quota/private mode errors
  }
}

let state = loadStateOrCreateNew()
const history: GameState[] = []

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing #app')

const dispatch = (action: GameAction) => {
  if (action.kind === 'undo') {
    const prev = history.pop()
    if (!prev) return
    state = prev
    persistState(state)
    renderApp(root, state, dispatch, { canUndo: history.length > 0 })
    return
  }

  if (action.kind === 'restart') history.length = 0
  else history.push(state)

  state = action.reduce(state)
  persistState(state)
  renderApp(root, state, dispatch, { canUndo: history.length > 0 })
}

persistState(state)
renderApp(root, state, dispatch, { canUndo: history.length > 0 })
