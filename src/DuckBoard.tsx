import { batch, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show, Signal } from "solid-js"
import { Piece as DuckOpsPiece, DuckChess, makeSquare, parseFen, parseSquare, SquareName, Move, makeUci, parseUci} from 'duckops'
import createRAF from "@solid-primitives/raf";
import { makeEventListener } from "@solid-primitives/event-listener";

const eventPosition = (e: MouchEvent): [number, number] | undefined => {
  if (e.clientX || e.clientX === 0) return [e.clientX, e.clientY!];
  if (e.targetTouches?.[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
  return; // touchend has no position!
};

const eventPositionWithBounds = (e: MouchEvent, bounds: DOMRectReadOnly): [number, number] | undefined => {
  let pos = eventPosition(e)

  if (pos) {
    return [(pos[0] - bounds.left) / bounds.width, (pos[1] - bounds.top) / bounds.height]
  }
}



function lerp(a: number, b: number, t = 0.1) {
    return (1 - t) * a + t * b
}

//@ts-ignore
function appr(v: number, t: number, by: number) {
    if (v < t) {
        return Math.min(v + by, t)
    } else if (v > t) {
        return Math.max(v - by, t)
    } else {
        return v
    }
}

type MouchEvent = Event & Partial<MouseEvent & TouchEvent>


export type Color = 'black' | 'white'

const FILES = 'abcdefgh'.split('')
const RANKS = '87654321'.split('')
const FILES_REVERSED = FILES.slice(0).reverse()
const RANKS_REVERSED = RANKS.slice(0).reverse()

const ROLES = 'kqrbnpKQRBNPd'

type Role = typeof ROLES[number]
type File = typeof FILES[number]
type Rank = typeof RANKS[number]

const all_squares: SquareName[] = FILES.flatMap(file => RANKS.map(rank => `${file}${rank}` as SquareName))

export type Pos = { file: File, rank: Rank }

type Piece = {
  role: Role,
  file: File,
  rank: Rank
}

const p_role_compat = (p: DuckOpsPiece): Role => {

  let roles = { pawn: 'p', knight: 'n', bishop: 'b', king: 'k', queen: 'q', rook: 'r' }
  let role = roles[p.role]
  return p.color === 'white' ? role.toUpperCase() : role
}


const posSquareName = (p: {file: File, rank: Rank }) => `${p.file}${p.rank}` as SquareName
const pos2square = (p: {file: File, rank: Rank }) => parseSquare(posSquareName(p))

const coord_to_percent = (coord: { file: File, rank: Rank }, is_flipped?: boolean) => {
  let files = is_flipped ? FILES_REVERSED : FILES
  let ranks = is_flipped ? RANKS_REVERSED : RANKS

  let left = files.indexOf(coord.file) * 100
  let top = ranks.indexOf(coord.rank) * 100

  return [left, top]
}

const distance = (a: { left: number, top: number }, b: { left: number, top: number }) => {
  let x = a.left - b.left
  let y = a.top - b.top
  return Math.sqrt(x * x + y * y)
}

const abs_to_coord = (pos: [number, number], is_flipped: boolean) => {
  let files = is_flipped ? FILES_REVERSED : FILES
  let ranks = is_flipped ? RANKS : RANKS_REVERSED

  let file = Math.floor(8 * pos[0])
  let rank = 7 - Math.floor(8 * pos[1])

  return { file: files[file], rank: ranks[rank] }
}




type IAnimation = {
  t: number,
  start: number
}

class OnPiece {

  get has_animation() {
    return this.animation_left !== undefined && this.animation_top !== undefined
  }

  _animation_left: Signal<IAnimation | undefined>
  _animation_top: Signal<IAnimation | undefined>

  get animation_left() {
    return this._animation_left[0]()
  }

  get animation_top() {
    return this._animation_top[0]()
  }

  set animation_left(_: IAnimation | undefined) {
    this._animation_left[1](_)
  }

  set animation_top(_: IAnimation | undefined) {
    this._animation_top[1](_)
  }

  get animated_left() {
    return this._left[0]()
  }

  set animated_left(_: number) {
    this._left[1](_)
  }

  private _left: Signal<number>


  get animated_top() {
    return this._top[0]()
  }

  set animated_top(_: number) {
    this._top[1](_)
  }

  private _top: Signal<number>

  get file() {
    return this.piece.file
  }

  get rank() {
    return this.piece.rank
  }

  left: number
  top: number


  get ghosted() {
    return this._is_ghosted[0]()
  }

  set ghosted(_: boolean) {
    this._is_ghosted[1](_)
  }

  _is_ghosted: Signal<boolean>

  constructor(readonly piece: Piece, readonly is_flipped: boolean) {
    [this.left, this.top] = coord_to_percent(piece, is_flipped)
    this._left = createSignal(this.left)
    this._top = createSignal(this.top)

    this._animation_left = createSignal()
    this._animation_top = createSignal()

    this._is_ghosted = createSignal(false)
  }
}

// @ts-ignore
const on_piece_equals = (a: OnPiece, b: OnPiece) => {
  return a.piece.file === b.piece.file && a.piece.rank === b.piece.rank
}

export const DuckBoard = (props: { on_user_move: (uci: string) => void, do_uci: string | undefined, do_takeback: undefined, orientation?: Color, fen: string, view_only?: Color | true }) => {

  const view_only = createMemo(() => props.view_only)

  let [move_before_duck, set_move_before_duck] = createSignal<[Move, DuckChess] | undefined>(undefined)

  const [duckchess, set_duckchess] = createSignal(DuckChess.fromSetupUnchecked(parseFen(props.fen).unwrap()), { equals: false })

  const can_move_piece = createMemo(() => (!view_only() || view_only() === duckchess().turn) && move_before_duck() === undefined)

  createEffect(on(() => props.fen, fen => {
    set_duckchess(DuckChess.fromSetupUnchecked(parseFen(fen).unwrap()))
  }))

  const with_duckchess = (f: (d: DuckChess) => DuckChess) => {
    set_duckchess(f(duckchess()))
  }

  const pieces = createMemo(() => {
    let ps = all_squares.flatMap(square => {
      let p = duckchess().board.get(parseSquare(square))

      if (p) {
        return {
          role: p_role_compat(p),
          file: square[0],
          rank: square[1]
        } as Piece
      }
    }).filter(Boolean) as Piece[]

    let duck = duckchess().board.get_duck()
    if (duck) {
      ps.push({
        role: 'd',
        file: makeSquare(duck)[0],
        rank: makeSquare(duck)[1]
      } as Piece)
    }
    return ps
  })

  const turn = createMemo(() => duckchess().turn)

  const orientation = createMemo(() => props.orientation ?? 'white')

  const is_flipped = createMemo(() => orientation() === 'black')

  const files = createMemo(() => is_flipped() ? FILES_REVERSED : FILES)
  const ranks = createMemo(() => is_flipped() ? RANKS_REVERSED : RANKS)


  const on_pieces_fresh = createMemo<OnPiece[]>(() => pieces().map(piece => new OnPiece(piece, is_flipped())))

  const on_pieces_animated = createMemo<OnPiece[]>(on(on_pieces_fresh, (new_pieces: OnPiece[], _, prev?: OnPiece[]) => {
    if (!prev) {
      return new_pieces
    }

    let old_pieces = prev
    let res: OnPiece[] = []

    function match_old2new(d: number = 0) {
      for (let _ of new_pieces) {
        for (let old of old_pieces) {
          if (old.ghosted || _.piece.role !== old.piece.role) {
            continue
          }

          if (distance(_, old) <= d) {
            new_pieces.splice(new_pieces.indexOf(_), 1)
            old_pieces.splice(old_pieces.indexOf(old), 1)

            if (_.ghosted) {
            } else {
              _.animation_left = { t: 0, start: old.animated_left }
              _.animation_top = { t: 0, start: old.animated_top }
            }
            res.push(_)
            return true
          }
        }
      }
      return false
    }

    batch(() => {
      while (match_old2new(0)) {
      }
      while (match_old2new(300)) {
      }
      while (match_old2new(500)) {
      }
      while (match_old2new(800)) {
      }
      while (match_old2new(900)) {
      }
      res.push(...new_pieces)
    })

    return res
  }))

  const has_animation = () => on_pieces_animated().some(_ => _.has_animation)

  createEffect(on(has_animation, (has_animation => {
    if (!has_animation) {
      return
    }


    let pieces = on_pieces_animated().filter(_ => _.has_animation)

    const [_running, start, stop] = createRAF(step)

    let last: number | undefined
    function step(now: number) {
      let dt = (now - (last ?? now - 16)) / 1000

      let dur = 0.2

      batch(() => {
        pieces.forEach(_ => {
          if (_.animation_left) {
            let { start } = _.animation_left

            _.animation_left.t += dt / dur
            if (_.animation_left.t > 1) {
              _.animation_left = undefined
              _.animated_left = _.left
            } else {
              _.animated_left = lerp(start, _.left, _.animation_left.t)
            }
          }
          if (_.animation_top) {
            let { start } = _.animation_top

            _.animation_top.t += dt / dur
            if (_.animation_top.t > 1) {
              _.animation_top = undefined
              _.animated_top = _.top
            } else {
              _.animated_top = lerp(start, _.top, _.animation_top.t)
            }
          }
        })
      })
    }

    start()
    onCleanup(() => {
      stop()
    })
  })))


  const [last_move, set_last_move] = createSignal<Move | undefined>(undefined)


  const [drag_orig, set_drag_orig] = createSignal<Pos | undefined>(undefined, { equals: false })
  const [drag_move, set_drag_move] = createSignal<[number, number] | undefined>(undefined, { equals: false })

  const [selected_square, set_selected_square] = createSignal<Pos | undefined>(undefined, { equals: false })

  const selected_piece = createMemo(() => {
    let square = selected_square()
    let pieces = on_pieces_animated()

    if (square) {
      return pieces.find(_ => _.file === square.file && _.rank == square.rank)
    }
  })

  const dragging_piece = createMemo(on(selected_piece, piece => {
    if (piece) {
      return new OnPiece(piece.piece, piece.is_flipped) 
    }
  }))

  const selected_dests = createMemo(() => {
    let dc = duckchess()
    let piece = selected_piece()
    if (piece) {
      let set = dc.dests(parseSquare(posSquareName(piece)))

      return Array.from(set, makeSquare)
    }
  })

  const [duck_square, set_duck_square] = createSignal<Pos | undefined>()
  const temp_duck_piece = createMemo(on(duck_square, (pos) => {
    if (pos) {
      return new OnPiece({ role: 'd', file: pos.file, rank: pos.rank }, is_flipped())
    }
  }))

  const duck_square_on_board = createMemo(() => {
    let duck = duckchess().board.duck
    if (duck) {
      let sq = makeSquare(duck)
      return { file: sq[0], rank: sq[1] }
    }
  })

  const duck_initial_dests = createMemo(() => {
    let dc = duckchess()
    let mbd = move_before_duck()

    if (mbd !== undefined && !dc.board.duck) {
      let [move] = mbd

      return Array.from(dc.duck_dests(move.from, move.to), makeSquare)
    }
  })

  const duck_move_dests = createMemo(() => {
    let dc = duckchess()
    let mbd = move_before_duck()

    if (mbd !== undefined && dc.board.duck) {
      let [move] = mbd

      return Array.from(dc.duck_dests(move.from, move.to), makeSquare)
    }
  })


  createEffect(on(() => props.fen, () => {
    set_last_move(undefined)
  }))

  createEffect(on(() => props.do_uci, (uci: string | undefined) => {
    if (!uci) {
      return
    }
    let move = parseUci(uci)
    if (move) {
      batch(() => {
        with_duckchess((dc: DuckChess) => {
          dc.play(move)
          dc.play_duck(move)
          set_move_before_duck(undefined)
          return dc
        })
      })

      set_last_move({ from: move.from, to: move.to })
      set_selected_square(undefined)
    }
  }))

  createEffect(on(() => props.do_takeback, () => {

    let md = move_before_duck()

    if (md) {
      let [_, dc] = md

      batch(() => {
        set_duck_square(undefined)
        set_selected_square(undefined)
        set_move_before_duck(undefined)
        with_duckchess(() => dc)
      })
    }

  }))

  createEffect(on(selected_piece, (piece) => {

    if (piece) {
      piece.ghosted = true

      onCleanup(() => {
        piece.ghosted = false
      })
    }

  }))

  createEffect(on(drag_orig, (orig => {
    let s = selected_square()
    let dc = duckchess()
    let can = can_move_piece()
    if (orig) {

      if (can && dc.board.get(pos2square(orig))?.color === turn()) {
        set_selected_square(orig)
      }

      let dids = duck_initial_dests()
      if (dids) {
        if (dids.includes(posSquareName(orig))) {
          set_duck_square(orig)
        }
      }

      let dmds = duck_move_dests()
      if (dmds) {
        set_selected_square(duck_square_on_board())
      }

    } else {
      if (s) {
        set_selected_square(undefined)
      }
    }
  })))

  createEffect(on(drag_move, (move => {
    if (!move) {
      return
    }

    let drag = dragging_piece()
    if (drag) {
      drag.animated_left = move[0] * 800 - 50
      drag.animated_top = move[1] * 800 - 50
    }


    if (duck_square()) {
      let orig = abs_to_coord(move, is_flipped())
      let dids = duck_initial_dests()
      if (orig && dids && dids.includes(posSquareName(orig))) {
        set_duck_square(orig)
      } else {
        set_duck_square(undefined)
      }
    }
  })))


  let $duckboard_el: HTMLDivElement

  onMount(() => {

    let [on_resize, set_on_resize] = createSignal(undefined, { equals: false })
    let bounds = createMemo(on(on_resize, () => $duckboard_el.getBoundingClientRect()))
    const dragStart = (e: MouchEvent) => {
      let position = eventPositionWithBounds(e, bounds())
      if (position) {
        let orig = abs_to_coord(position, is_flipped())

        if (orig) {
          e.preventDefault()
          set_drag_orig(orig)
          set_drag_move(position)
        }
      }
    }

    const on_move_handle = (e: MouchEvent) => {
      let position = eventPositionWithBounds(e, bounds())
      if (position) {
        e.preventDefault()
        set_drag_move(position)
      }
    }

    const on_drop_handle = (e: MouchEvent) => {

      let position = eventPositionWithBounds(e, bounds())
      if (position) {
        let dest = abs_to_coord(position, is_flipped())

        if (dest) {
          e.preventDefault()

          let ds = duck_square()

          let mbd = move_before_duck()

          if (ds) {
            let move = {
              duck: parseSquare(posSquareName(ds))
            }
            batch(() => {
              with_duckchess((dc: DuckChess) => {
                dc.play_duck(move)



                props.on_user_move(makeUci({
                  from: mbd![0].from,
                  to: mbd![0].to,
                  promotion: mbd![0].promotion,
                  duck: move.duck
                }))


                set_move_before_duck(undefined)
                return dc
              })
            })

            set_last_move({ from: mbd![0].from, to: mbd![0].to })
            set_selected_square(undefined)
            set_duck_square(undefined)
            return
          }

          set_duck_square(undefined)

          let dests = selected_dests()

          if (dests?.includes(posSquareName(dest))) {
            let orig = posSquareName(selected_piece()!.piece)

            batch(() => {
              with_duckchess((dc: DuckChess) => {
                let move = {
                  from: parseSquare(orig),
                  to: parseSquare(posSquareName(dest))
                }
                set_move_before_duck([move, dc.clone()])
                dc.play(move)
                return dc
              })
            })

            set_selected_square(undefined)
            return
          }

          let dmds = duck_move_dests()


          if (dmds?.includes(posSquareName(dest))) {
            batch(() => {
              with_duckchess((dc: DuckChess) => {
                let move = {
                  duck: parseSquare(posSquareName(dest))
                }


                props.on_user_move(makeUci({
                  from: mbd![0].from,
                  to: mbd![0].to,
                  promotion: mbd![0].promotion,
                  duck: move.duck
                }))

                dc.play_duck(move)
                set_move_before_duck(undefined)
                return dc
              })
            })

            set_last_move({ from: mbd![0].from, to: mbd![0].to })

            set_selected_square(undefined)
            return
          }
        }
      }


      batch(() => {
        set_drag_orig(undefined)
        set_drag_move(undefined)
      })
    }

    let clear = []
    clear.push(makeEventListener($duckboard_el, 'touchstart', e => dragStart(e), { passive: false }))
    clear.push(makeEventListener($duckboard_el, 'mousedown', e => dragStart(e), { passive: false }))

    const on_resize_handle = () => set_on_resize()

    clear.push(makeEventListener(document, 'scroll', on_resize_handle))
    clear.push(makeEventListener(document, 'resize', on_resize_handle))

    clear.push(makeEventListener(document, 'touchmove', on_move_handle))
    clear.push(makeEventListener(document, 'mousemove', on_move_handle))

    clear.push(makeEventListener(document, 'touchend', on_drop_handle))
    clear.push(makeEventListener(document, 'mouseup', on_drop_handle))

    onCleanup(() => {
      clear.forEach(_ => _())
    })
  })

  return (<>
  <div class='duckboard is2d'>
    <div class='files'>
      <For each={files()}>{ file => <div class='file'>{file}</div> }</For>
    </div>
    <div class='ranks'>
      <For each={ranks()}>{ rank => <div class='rank'>{rank}</div> }</For>
    </div>
    <div ref={_ => $duckboard_el = _} class='pieces'>
        <For each={duck_initial_dests()}>{ dest => <Dest dest={dest}/> }</For>
        <For each={selected_dests()}>{ dest => <Dest dest={dest}/> }</For>
        <For each={duck_move_dests()}>{ dest => <Dest dest={dest}/> }</For>
        <Show when={selected_square()}>{ selected => <Selected selected={posSquareName(selected())}/>}</Show>

        <Show when={last_move()}>{ last_move =>
          <>
            <LastMove square={makeSquare(last_move().from)} />
            <LastMove square={makeSquare(last_move().to)} />
          </>
        }</Show>
        <For each={on_pieces_animated()}>{piece => <Piece piece={piece}/>}</For>
        <Show when={dragging_piece()}>{piece => <Piece klass='dragging' piece={piece()}/>}</Show>
        <Show when={temp_duck_piece()}>{ duck => <Piece piece={duck()}/> }</Show>
    </div>
  </div>
  </>)
}

const role_to_klass: Record<Role, string> = {
  'k': 'king black',
  'q': 'queen black',
  'r': 'rook black',
  'n': 'knight black',
  'b': 'bishop black',
  'p': 'pawn black',
  'K': 'king white',
  'Q': 'queen white',
  'R': 'rook white',
  'N': 'knight white',
  'B': 'bishop white',
  'P': 'pawn white',
  'd': 'duck'
}

const Piece = (props: { klass?: string, piece: OnPiece }) => {
  let klass = () => [props.klass, role_to_klass[props.piece.piece.role], props.piece.ghosted ? 'ghost': ''].filter(Boolean).join(' ')

  let style = createMemo(() => `transform: translate(${props.piece.animated_left}%, ${props.piece.animated_top}%);`)

  return (<div class={'piece ' + klass()} style={style()}></div>)
}

const SquareKlass = (props: { klass: string, square: SquareName }) => {

  let pos = createMemo(() => coord_to_percent({ file: props.square[0], rank: props.square[1] }))

  let style = createMemo(() => `transform: translate(${pos()[0]}%, ${pos()[1]}%);`)

  return (<div class={'square ' + props.klass} style={style()}></div>)
}

const Dest = (props: { dest: SquareName }) => {
  return <SquareKlass klass='dest' square={props.dest} />
}

const Selected = (props: { selected: SquareName }) => {
  return <SquareKlass klass='selected' square={props.selected} />
}

const LastMove = (props: { square: SquareName }) => {
  return <SquareKlass klass='last-move' square={props.square} />
}




