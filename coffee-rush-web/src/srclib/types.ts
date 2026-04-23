export type IngredientId =
  | 'coffee'
  | 'milk'
  | 'steam'
  | 'ice'
  | 'chocolate'
  | 'caramel'
  | 'tea'
  | 'water'

export type Phase = 'setup' | 'upgrade' | 'move' | 'pour' | 'process' | 'time' | 'gameover'

export type UpgradeId = 'diagonalMove' | 'doubleCorner' | 'doubleSpecialCell'
export type DifficultyId = 'intern' | 'barista' | 'burned'

export type Coord = Readonly<{ r: number; c: number }>

export type OrderCard = Readonly<{
  id: string
  name: string
  ingredients: ReadonlyArray<IngredientId>
  tags?: ReadonlyArray<string>
}>

export type Content = Readonly<{
  boardLayout: ReadonlyArray<ReadonlyArray<IngredientId>>
  specialCells: ReadonlyArray<Coord>
  deck: ReadonlyArray<OrderCard>
  upgrades: ReadonlyArray<{
    id: UpgradeId
    name: string
    description: string
  }>
}>

export type CupState = Readonly<{
  ingredients: ReadonlyArray<IngredientId>
}>

export type GameState = Readonly<{
  seed: number
  phase: Phase
  difficulty: DifficultyId
  content: Content

  meeple: Coord
  rushTokens: number
  penalties: ReadonlyArray<OrderCard>
  completed: ReadonlyArray<OrderCard>
  discardCompleted: ReadonlyArray<OrderCard>

  activeUpgrades: ReadonlyArray<UpgradeId>

  tabs: Readonly<{
    tab1: ReadonlyArray<OrderCard>
    tab2: ReadonlyArray<OrderCard>
    tab3: ReadonlyArray<OrderCard>
    tab4: ReadonlyArray<OrderCard>
  }>

  deckCursor: number

  move: Readonly<{
    stepsMax: number
    stepsLeft: number
    collectedThisTurn: ReadonlyArray<IngredientId>
  }>

  setup: Readonly<{
    selectedStartCup: 0 | 1 | 2
  }>

  cups: Readonly<[CupState, CupState, CupState]>

  pour: Readonly<{
    selectedCollectedIdx: number | null
  }>

  process: Readonly<{
    completedThisTurn: number
  }>

  log: ReadonlyArray<string>
}>

