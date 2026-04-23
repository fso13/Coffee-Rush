import type { Coord, GameState, IngredientId, OrderCard } from './types'
import { Actions, type GameAction } from './game'
import { drinkIconDataUri, ingredientIconDataUri, ingredientLabelRu } from './icons'

type DragPayload =
  | Readonly<{ kind: 'collected'; idx: number }>
  | Readonly<{ kind: 'cup'; cupIdx: 0 | 1 | 2 }>

type ActiveDrag = Readonly<{
  payload: DragPayload
  ghost: HTMLElement
  offsetX: number
  offsetY: number
}>

let activeDrag: ActiveDrag | null = null
let lastDropTarget: HTMLElement | null = null
let activeDispatch: ((a: GameAction) => void) | null = null
let rulesOpen = false

function clearDropOver(): void {
  if (lastDropTarget) lastDropTarget.classList.remove('dropOver')
  lastDropTarget = null
}

function setDropOver(el: HTMLElement | null): void {
  if (lastDropTarget === el) return
  clearDropOver()
  if (el) {
    el.classList.add('dropOver')
    lastDropTarget = el
  }
}

function startDirectDrag(e: PointerEvent, payload: DragPayload, sourceEl: HTMLElement): void {
  if (activeDrag) return
  if (!activeDispatch) return
  if (e.button !== 0) return

  const rect = sourceEl.getBoundingClientRect()
  const ghost = sourceEl.cloneNode(true) as HTMLElement
  ghost.classList.add('dragGhost')
  ghost.style.width = `${rect.width}px`
  ghost.style.height = `${rect.height}px`
  document.body.append(ghost)

  sourceEl.classList.add('dragSource')

  activeDrag = {
    payload,
    ghost,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
  }

  moveDirectDrag(e)

  try {
    sourceEl.setPointerCapture(e.pointerId)
  } catch {
    // ignore
  }

  e.preventDefault()
}

function moveDirectDrag(e: PointerEvent): void {
  if (!activeDrag) return
  activeDrag.ghost.style.left = `${e.clientX - activeDrag.offsetX}px`
  activeDrag.ghost.style.top = `${e.clientY - activeDrag.offsetY}px`

  activeDrag.ghost.style.pointerEvents = 'none'
  const elUnder = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
  activeDrag.ghost.style.pointerEvents = ''

  if (!elUnder) {
    setDropOver(null)
    return
  }

  if (activeDrag.payload.kind === 'collected') {
    const cup = elUnder.closest('.cup') as HTMLElement | null
    setDropOver(cup)
  } else {
    const card = elUnder.closest('.card') as HTMLElement | null
    setDropOver(card)
  }
}

function endDirectDrag(): void {
  if (!activeDrag) return
  const { payload, ghost } = activeDrag
  activeDrag = null

  const src = document.querySelector('.dragSource') as HTMLElement | null
  src?.classList.remove('dragSource')

  ghost.remove()

  const target = lastDropTarget
  clearDropOver()

  if (!target || !activeDispatch) return

  if (payload.kind === 'collected') {
    const raw = target.getAttribute('data-cup-idx')
    const cupIdx = raw === '0' ? 0 : raw === '1' ? 1 : raw === '2' ? 2 : null
    if (cupIdx === null) return
    activeDispatch(Actions.pourCollectedIdxToCup(cupIdx, payload.idx))
    return
  }

  const tabKey = target.getAttribute('data-tab-key') as keyof GameState['tabs'] | null
  const cardId = target.getAttribute('data-card-id')
  if (!tabKey || !cardId) return
  activeDispatch(Actions.fulfillFromTab(tabKey, cardId, payload.cupIdx))
}

if (!('__coffeeRushDirectDrag' in window)) {
  ;(window as any).__coffeeRushDirectDrag = true
  window.addEventListener('pointermove', (e) => moveDirectDrag(e as PointerEvent), { passive: true })
  window.addEventListener('pointerup', () => endDirectDrag())
  window.addEventListener('pointercancel', () => endDirectDrag())
}

function phaseRu(phase: GameState['phase']): string {
  switch (phase) {
    case 'setup':
      return 'старт'
    case 'upgrade':
      return 'улучшения'
    case 'move':
      return 'движение'
    case 'pour':
      return 'разлив'
    case 'process':
      return 'обработка'
    case 'time':
      return 'время'
    case 'gameover':
      return 'конец игры'
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Record<string, unknown>,
  children?: Array<Node | string | null | undefined>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null) continue
      if (k === 'className') node.className = String(v)
      else if (k.startsWith('on') && typeof v === 'function') {
        const ev = k.slice(2).toLowerCase()
        node.addEventListener(ev, v as unknown as EventListener)
      }
      else if (k === 'disabled') (node as HTMLButtonElement).disabled = Boolean(v)
      else node.setAttribute(k, String(v))
    }
  }
  if (children) for (const ch of children) if (ch !== null && ch !== undefined) node.append(ch)
  return node
}

function fmtIng(i: IngredientId): string {
  return ingredientLabelRu(i)
}

function isSpecial(s: GameState, coord: Coord): boolean {
  return s.content.specialCells.some((x) => x.r === coord.r && x.c === coord.c)
}

function cardIngredientsView(ings: ReadonlyArray<IngredientId>): HTMLElement {
  const wrap = el('div', { className: 'tags' })
  for (const ing of ings) {
    wrap.append(
      el('span', { className: 'chip' }, [
        el('img', {
          src: ingredientIconDataUri(ing),
          width: 18,
          height: 18,
          alt: fmtIng(ing),
          style: 'vertical-align:-3px; margin-right:6px;',
        }),
        fmtIng(ing),
      ]),
    )
  }
  return wrap
}

function boardView(state: GameState, dispatch: (a: GameAction) => void): HTMLElement {
  const diagonal = state.activeUpgrades.includes('diagonalMove')
  const layout = state.content.boardLayout
  const clickable = new Set<string>()
  if (state.phase === 'setup') {
    for (let r = 0; r < layout.length; r++) for (let c = 0; c < layout[0]!.length; c++) clickable.add(`${r},${c}`)
  } else if (state.phase === 'move' && state.move.stepsLeft > 0) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue
        if (!diagonal && Math.abs(dr) + Math.abs(dc) !== 1) continue
        const r = state.meeple.r + dr
        const c = state.meeple.c + dc
        if (r < 0 || c < 0 || r >= layout.length || c >= layout[0]!.length) continue
        clickable.add(`${r},${c}`)
      }
    }
  }

  const grid = el('div', { className: 'board' })
  for (let r = 0; r < layout.length; r++) {
    for (let c = 0; c < layout[0]!.length; c++) {
      const key = `${r},${c}`
      const isMeeple = state.meeple.r === r && state.meeple.c === c
      const can = clickable.has(key)
      const cell = el(
        'div',
        {
          className: `cell${can ? ' clickable' : ''}${isMeeple ? ' here' : ''}`,
          onClick: can
            ? () => {
                if (state.phase === 'setup') dispatch(Actions.placeStartMeeple({ r, c }))
                else dispatch(Actions.moveTo({ r, c }))
              }
            : undefined,
        },
        [
          isSpecial(state, { r, c }) ? el('div', { className: 'specialDot' }) : null,
          el('div', { className: 'ing' }, [
            el('img', {
              className: 'ingIconLg',
              src: ingredientIconDataUri(layout[r]![c]!),
              alt: fmtIng(layout[r]![c]!),
            }),
            fmtIng(layout[r]![c]!),
          ]),
        ],
      )
      grid.append(cell)
    }
  }
  return grid
}

function cupsView(state: GameState, dispatch: (a: GameAction) => void): HTMLElement {
  const cupsWrap = el('div', { className: 'cups' })
  for (let i = 0; i < 3; i++) {
    const cup = state.cups[i as 0 | 1 | 2]
    const cupIdx = i as 0 | 1 | 2
    const draggableCup = state.phase === 'process'
    const cupEl = el('div', {
      className: `cup${draggableCup ? ' draggableCup' : ''}`,
      'data-cup-idx': String(cupIdx),
      onPointerDown: draggableCup
        ? (e: PointerEvent) => startDirectDrag(e, { kind: 'cup', cupIdx }, e.currentTarget as HTMLElement)
        : undefined,
    })
    cupEl.append(
      el('div', { className: 'cupTitle' }, [
        el('b', {}, [`Чашка ${i + 1}`]),
        el('span', { className: 'small' }, [`${cup.ingredients.length} шт.`]),
      ]),
    )
    cupEl.append(cardIngredientsView(cup.ingredients))
    cupEl.append(
      el('div', { className: 'row' }, [
        el(
          'button',
          {
            className: 'btn danger',
            onClick: () => dispatch(Actions.emptyCup(i as 0 | 1 | 2)),
            disabled: cup.ingredients.length === 0,
          },
          ['Очистить'],
        ),
        state.phase === 'pour' && state.pour.selectedCollectedIdx !== null
          ? el(
              'button',
              {
                className: 'btn primary',
                onClick: () => dispatch(Actions.pourToCup(i as 0 | 1 | 2)),
              },
              ['Разлить выбранное'],
            )
          : null,
      ]),
    )
    cupsWrap.append(cupEl)
  }
  return cupsWrap
}

function collectedCompactView(state: GameState, dispatch: (a: GameAction) => void): HTMLElement {
  const body = el('div', { className: 'collectedCompactBody' })
  if (state.move.collectedThisTurn.length === 0) {
    body.append(el('div', { className: 'meta' }, ['(пока ничего)']))
  } else {
    const row = el('div', { className: 'row' })
    state.move.collectedThisTurn.forEach((ing, idx) => {
      const selected = state.pour.selectedCollectedIdx === idx
      row.append(
        el(
          'span',
          {
            className: `chip${selected ? ' selected' : ''}${state.phase === 'pour' ? ' draggableIng' : ''}`,
            onClick: state.phase === 'pour' ? () => dispatch(Actions.selectCollected(selected ? null : idx)) : undefined,
            title: state.phase === 'pour' ? 'Нажмите, чтобы выбрать' : undefined,
            onPointerDown:
              state.phase === 'pour'
                ? (e: PointerEvent) => startDirectDrag(e, { kind: 'collected', idx }, e.currentTarget as HTMLElement)
                : undefined,
          },
          [
            el('img', {
              src: ingredientIconDataUri(ing),
              width: 18,
              height: 18,
              alt: fmtIng(ing),
              style: 'vertical-align:-3px; margin-right:6px;',
            }),
            fmtIng(ing),
          ],
        ),
      )
    })
    body.append(row)

    if (state.phase === 'pour' && state.pour.selectedCollectedIdx !== null) {
      const idx = state.pour.selectedCollectedIdx
      body.append(
        el('div', { className: 'row' }, [
          el(
            'button',
            { className: 'btn', onClick: () => dispatch(Actions.selectCollected(null)) },
            ['Снять выбор'],
          ),
          el(
            'button',
            { className: 'btn danger', onClick: () => dispatch(Actions.discardCollected(idx)) },
            ['Сбросить выбранное'],
          ),
        ]),
      )
    }
  }
  return el('div', { className: 'collectedCompact' }, [
    el('div', { className: 'collectedCompactTitle' }, ['Собрано за ход']),
    body,
  ])
}

function tabColumn(
  state: GameState,
  dispatch: (a: GameAction) => void,
  title: string,
  tabKey: keyof GameState['tabs'],
  cards: ReadonlyArray<OrderCard>,
): HTMLElement {
  const col = el('div', { className: 'tabCol' })
  col.append(
    el('div', { className: 'tabHead' }, [
      el('b', {}, [title]),
      el('span', {}, [`${cards.length}`]),
    ]),
  )
  const list = el('div', { className: 'cards' })
  for (const card of cards) {
    const cardEl = el('div', { className: 'card', 'data-tab-key': String(tabKey), 'data-card-id': card.id })
    cardEl.append(
      el('div', { className: 'cardTitle' }, [
        el('b', {}, [
          el('img', {
            src: drinkIconDataUri(card.ingredients),
            width: 18,
            height: 18,
            alt: card.name,
            style: 'vertical-align:-3px; margin-right:6px;',
          }),
          card.name,
        ]),
        el('span', { className: 'id' }, ['']),
      ]),
    )
    cardEl.append(cardIngredientsView(card.ingredients))

    if (state.phase === 'process') {
      const acts = el('div', { className: 'actions' })
      for (let i = 0; i < 3; i++) {
        const ok = sameMultiset(state.cups[i as 0 | 1 | 2].ingredients, card.ingredients)
        acts.append(
          el(
            'button',
            {
              className: `btn${ok ? ' primary' : ''}`,
              disabled: !ok,
              onClick: ok ? () => dispatch(Actions.fulfillFromTab(tabKey, card.id, i as 0 | 1 | 2)) : undefined,
            },
            [`Чашка ${i + 1}`],
          ),
        )
      }
      cardEl.append(acts)
    }

    list.append(cardEl)
  }
  col.append(list)
  return col
}

function sameMultiset(a: ReadonlyArray<IngredientId>, b: ReadonlyArray<IngredientId>): boolean {
  if (a.length !== b.length) return false
  const aa = [...a].sort()
  const bb = [...b].sort()
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false
  return true
}

function rulesModalView(state: GameState, onClose: () => void): HTMLElement {
  const overlay = el('div', {
    className: 'rulesOverlay',
    onClick: (e: MouseEvent) => {
      if (e.target === overlay) onClose()
    },
  })

  const modal = el('div', { className: 'rulesModal' })
  modal.append(
    el('div', { className: 'rulesHeader' }, [
      el('h2', {}, ['Правила игры']),
      el('button', { className: 'btn', onClick: onClose }, ['Закрыть']),
    ]),
  )

  const body = el('div', { className: 'rulesBody' })
  body.append(
    el('section', { className: 'rulesSection' }, [
      el('h3', {}, ['Цель']),
      el('p', {}, [
        'Выполняйте заказы напитков, управляя 3 чашками и перемещаясь по карте ингредиентов. Игра заканчивается поражением при 5 штрафах.',
      ]),
      el('p', {}, [
        'Заказы в Таб 4, которые не успели выполнить к фазе времени, уходят в штрафы. За каждый такой заказ вы получаете 1 Rush-жетон.',
      ]),
    ]),
  )

  body.append(
    el('section', { className: 'rulesSection' }, [
      el('h3', {}, ['Подготовка']),
      el('ul', {}, [
        el('li', {}, ['Выберите стартовую чашку (1, 2 или 3).']),
        el('li', {}, ['Кликните стартовую клетку на поле 4x4.']),
        el('li', {}, [
          'Ингредиент со стартовой клетки сразу добавляется в выбранную чашку, после чего начинается фаза движения.',
        ]),
      ]),
    ]),
  )

  body.append(
    el('section', { className: 'rulesSection' }, [
      el('h3', {}, ['Поэтапность хода']),
      el('ol', {}, [
        el('li', {}, [el('b', {}, ['Move. ']), 'Двигайтесь по соседним клеткам (обычно 3 шага за ход) и собирайте ингредиенты.']),
        el('li', {}, [el('b', {}, ['Pour. ']), 'Разливайте собранные ингредиенты по чашкам или сбрасывайте лишнее.']),
        el('li', {}, [
          el('b', {}, ['Process. ']),
          'Выполняйте заказы, если состав ингредиентов в чашке полностью совпадает с картой заказа (с учетом количества и состава).',
        ]),
        el('li', {}, [
          el('b', {}, ['Time. ']),
          'Все заказы сдвигаются на 1 таб вниз; выпавшие из Таб 4 становятся штрафами. За каждый штраф получаете Rush-жетон.',
        ]),
        el('li', {}, [
          el('b', {}, ['Новый ход. ']),
          `После времени начинается новый Move. Если за прошлый ход выполнено заказов: K, в Таб 1 добирается до ${'2*K'} новых карт.`,
        ]),
      ]),
    ]),
  )

  body.append(
    el('section', { className: 'rulesSection' }, [
      el('h3', {}, ['Важные механики']),
      el('ul', {}, [
        el('li', {}, ['Rush: можно потратить 1 жетон в фазе Move, чтобы получить +1 шаг в текущем ходу.']),
        el('li', {}, ['Чашки можно очищать в фазах Pour и Process.']),
        el('li', {}, ['Заказ выполняется только при точном совпадении ингредиентов в чашке с картой.']),
        el('li', {}, ['Журнал внизу показывает последние действия и помогает отслеживать ход партии.']),
      ]),
    ]),
  )

  const upgradesList = el('ul')
  for (const up of state.content.upgrades) {
    upgradesList.append(el('li', {}, [el('b', {}, [`${up.name}. `]), up.description]))
  }

  body.append(
    el('section', { className: 'rulesSection' }, [
      el('h3', {}, ['Расширения / улучшения']),
      el('p', {}, ['Любое улучшение активируется за 3 выполненных заказа (карты уходят в сброс улучшений).']),
      upgradesList,
    ]),
  )

  modal.append(body)
  overlay.append(modal)
  return overlay
}

function upgradesPanel(state: GameState, dispatch: (a: GameAction) => void): HTMLElement {
  const panel = el('div', { className: 'panel' })
  panel.append(
    el('div', { className: 'panelHeader' }, [
      el('h2', {}, ['Улучшения']),
      el('span', { className: 'meta' }, [`Выполнено: ${state.completed.length}/3`]),
    ]),
  )
  const body = el('div', { className: 'panelBody' })
  const row = el('div', { className: 'row' })

  for (const up of state.content.upgrades) {
    const active = state.activeUpgrades.includes(up.id)
    row.append(
      el(
        'button',
        {
          className: `btn${active ? ' primary' : ''}`,
          disabled: active || state.completed.length < 3 || state.phase === 'gameover',
          onClick: () => dispatch(Actions.activateUpgrade(up.id)),
          title: up.description,
        },
        [active ? `✓ ${up.name}` : up.name],
      ),
    )
  }
  body.append(row)
  panel.append(body)
  return panel
}

export function renderApp(
  root: HTMLElement,
  state: GameState,
  dispatch: (a: GameAction) => void,
  options?: Readonly<{ canUndo?: boolean }>,
): void {
  activeDispatch = dispatch
  root.replaceChildren()

  const top = el('div', { className: 'topbar' })
  top.append(
    el('div', { className: 'title' }, [
      el('h1', {}, ['Кофейный Раш (соло)']),
      el('div', { className: 'sub' }, [
        `Фаза: ${phaseRu(state.phase)} • В колоде: ${Math.max(0, state.content.deck.length - state.deckCursor)}`,
      ]),
    ]),
  )
  top.append(
    el('div', { className: 'hud' }, [
      el(
        'button',
        {
          className: `btn${rulesOpen ? ' primary' : ''}`,
          onClick: () => {
            rulesOpen = !rulesOpen
            renderApp(root, state, dispatch, options)
          },
          title: 'Открыть справку по правилам',
        },
        ['Правила'],
      ),
      el('span', { className: 'pill' }, [el('b', {}, ['Rush']), ` ${state.rushTokens}`]),
      el('span', { className: 'pill' }, [el('b', {}, ['Штрафы']), ` ${state.penalties.length}/5`]),
      el('span', { className: 'pill' }, [el('b', {}, ['Выполнено']), ` ${state.completed.length}`]),
      el(
        'button',
        {
          className: 'btn',
          onClick: () => dispatch(Actions.undo()),
          disabled: !options?.canUndo || state.phase === 'gameover',
          title: 'Отменить последнее действие',
        },
        ['Отменить'],
      ),
      el(
        'button',
        {
          className: 'btn danger',
          onClick: () => dispatch(Actions.restart({ content: state.content, seed: Date.now() })),
        },
        ['Заново'],
      ),
    ]),
  )
  root.append(top)

  const cupsPanel = el('div', { className: 'panel', style: 'margin-bottom: 14px;' }, [
    el('div', { className: 'panelHeader' }, [
      el('h2', {}, ['Чашки']),
      el('span', { className: 'meta' }, ['(Нужно точное совпадение)']),
    ]),
    el('div', { className: 'panelBody cupsPanelBody' }, [
      el('div', { className: 'cupsCollectedLayout' }, [
        cupsView(state, dispatch),
        collectedCompactView(
          state.phase === 'pour' ? state : { ...state, pour: { selectedCollectedIdx: null } },
          dispatch,
        ),
      ]),
    ]),
  ])
  root.append(cupsPanel)

  const topControls = el('div', { className: 'topControls' })

  const layout = el('div', { className: 'layout' })

  // Left: board and move controls
  const left = el('div', { className: 'panel' })
  left.append(
    el('div', { className: 'panelHeader' }, [
      el('h2', {}, ['Поле ингредиентов (4×4)']),
      el('span', { className: 'meta' }, [
        state.phase === 'setup'
          ? 'Выберите стартовую клетку'
          : state.phase === 'move'
            ? `Ходы: ${state.move.stepsLeft}/${state.move.stepsMax}`
            : `Бариста: (${state.meeple.r},${state.meeple.c})`,
      ]),
    ]),
  )
  const leftBody = el('div', { className: 'panelBody' })
  leftBody.append(boardView(state, dispatch))
  leftBody.append(
    el('div', { className: 'row', style: 'margin-top: 12px;' }, [
      el(
        'button',
        {
          className: 'btn',
          disabled: state.phase !== 'move' || state.rushTokens <= 0,
          onClick: () => dispatch(Actions.spendRush()),
        },
        ['Потратить Rush (+1 шаг)'],
      ),
      el(
        'button',
        {
          className: 'btn primary',
          disabled: state.phase !== 'move',
          onClick: () => dispatch(Actions.finishMove()),
        },
        ['Закончить движение'],
      ),
    ]),
  )
  left.append(leftBody)
  layout.append(left)

  // Right: tabs panel
  const right = el('div', { className: 'rightGrid' })
  const rightMain = el('div', { className: 'rightMain' })

  const tabsPanel = el('div', { className: 'panel' })
  tabsPanel.append(
    el('div', { className: 'panelHeader' }, [
      el('h2', {}, ['Заказы']),
      el('span', { className: 'meta' }, ['Табы 1→4 (упало с Таб 4 = штраф)']),
    ]),
  )
  const tabsBody = el('div', { className: 'panelBody' })
  const tabs = el('div', { className: 'tabs' })
  tabs.append(tabColumn(state, dispatch, 'Таб 1', 'tab1', state.tabs.tab1))
  tabs.append(tabColumn(state, dispatch, 'Таб 2', 'tab2', state.tabs.tab2))
  tabs.append(tabColumn(state, dispatch, 'Таб 3', 'tab3', state.tabs.tab3))
  tabs.append(tabColumn(state, dispatch, 'Таб 4', 'tab4', state.tabs.tab4))
  tabsBody.append(tabs)
  tabsPanel.append(tabsBody)
  rightMain.append(tabsPanel)

  const phasePanel = el('div', { className: 'banner' })
  if (state.phase === 'gameover') {
    phasePanel.append(
      el('div', { className: 'left' }, [
        el('b', { style: `color: var(--danger);` }, ['Game Over']),
        el('span', {}, ['Вы получили 5 штрафов.']),
      ]),
    )
    phasePanel.append(
      el(
        'button',
        { className: 'btn primary', onClick: () => dispatch(Actions.restart({ content: state.content, seed: Date.now() })) },
        ['Играть снова'],
      ),
    )
  } else if (state.phase === 'setup') {
    phasePanel.append(
      el('div', { className: 'left' }, [
        el('b', {}, ['Setup']),
        el('span', {}, ['Выберите стартовую чашку и кликните клетку поля для размещения бариста.']),
      ]),
    )
    phasePanel.append(
      el('div', { className: 'row' }, [
        el(
          'button',
          {
            className: `btn${state.setup.selectedStartCup === 0 ? ' primary' : ''}`,
            onClick: () => dispatch(Actions.chooseStartCup(0)),
          },
          ['Чашка 1'],
        ),
        el(
          'button',
          {
            className: `btn${state.setup.selectedStartCup === 1 ? ' primary' : ''}`,
            onClick: () => dispatch(Actions.chooseStartCup(1)),
          },
          ['Чашка 2'],
        ),
        el(
          'button',
          {
            className: `btn${state.setup.selectedStartCup === 2 ? ' primary' : ''}`,
            onClick: () => dispatch(Actions.chooseStartCup(2)),
          },
          ['Чашка 3'],
        ),
      ]),
    )
  } else if (state.phase === 'move') {
    phasePanel.append(
      el('div', { className: 'left' }, [
        el('b', {}, ['Move']),
        el('span', {}, ['Нажимайте подсвеченные клетки рядом, чтобы двигаться и собирать ингредиенты.']),
      ]),
    )
    phasePanel.append(el('div', {}, ['']))
  } else if (state.phase === 'pour') {
    phasePanel.append(
      el('div', { className: 'left' }, [
        el('b', {}, ['Pour']),
        el('span', {}, ['Выберите собранный ингредиент и разлейте в чашку (или сбросьте).']),
      ]),
    )
    phasePanel.append(
      el(
        'button',
        { className: 'btn primary', onClick: () => dispatch(Actions.finishPour()) },
        ['Закончить разлив → Обработка'],
      ),
    )
  } else if (state.phase === 'process') {
    phasePanel.append(
      el('div', { className: 'left' }, [
        el('b', {}, ['Process']),
        el('span', {}, [
          `Выполняйте заказы, полностью совпадая чашкой. За ход выполнено: ${state.process.completedThisTurn}.`,
        ]),
      ]),
    )
    phasePanel.append(
      el(
        'button',
        { className: 'btn primary', onClick: () => dispatch(Actions.finishProcess()) },
        ['Закончить обработку → Время'],
      ),
    )
  } else if (state.phase === 'time') {
    phasePanel.append(
      el('div', { className: 'left' }, [
        el('b', {}, ['Flow of Time']),
        el('span', {}, [
          'Заказы сдвигаются вправо на 1 таб. Упавшие с Таб 4 становятся штрафами и дают Rush-жетоны.',
        ]),
      ]),
    )
    phasePanel.append(
      el(
        'button',
        { className: 'btn primary', onClick: () => dispatch(Actions.resolveTime()) },
        ['Применить время → Новый ход'],
      ),
    )
  }
  const upgradesTop = upgradesPanel(state, dispatch)
  upgradesTop.classList.add('upgradesCompact')
  topControls.append(phasePanel, upgradesTop)
  root.append(topControls)

  right.append(rightMain)

  layout.append(right)
  root.append(layout)

  // Log
  const logPanel = el('div', { className: 'panel', style: 'margin-top: 14px;' })
  logPanel.append(el('div', { className: 'panelHeader' }, [el('h2', {}, ['Журнал']), el('span', { className: 'meta' }, ['последние 40'])]))
  const logBody = el('div', { className: 'panelBody' })
  const lines = el('div', { style: 'display:grid; gap:6px; font-size:12px; color: var(--muted);' })
  for (const line of state.log) lines.append(el('div', {}, [line]))
  logBody.append(lines)
  logPanel.append(logBody)
  root.append(logPanel)

  if (rulesOpen) {
    root.append(
      rulesModalView(state, () => {
        rulesOpen = false
        renderApp(root, state, dispatch, options)
      }),
    )
  }
}

