import { batch, createEffect, createMemo, createSignal, For, on, onCleanup, Signal, untrack } from "solid-js"

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


export type Color = 'black' | 'white'

const FILES = 'abcdefgh'.split('')
const RANKS = '87654321'.split('')
const FILES_REVERSED = FILES.slice(0).reverse()
const RANKS_REVERSED = RANKS.slice(0).reverse()

const ROLES = 'kqrbnpKQRBNPd'

type Role = typeof ROLES[number]
type File = typeof FILES[number]
type Rank = typeof RANKS[number]

type Piece = {
  role: Role,
  file: File,
  rank: Rank
}
const is_role = (c: string): c is Role => {
  return ROLES.indexOf(c) !== -1
}

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
  return x * x + y * y
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

  constructor(readonly piece: Piece, readonly is_flipped: boolean) {
    [this.left, this.top] = coord_to_percent(piece, is_flipped)
    this._left = createSignal(this.left)
    this._top = createSignal(this.top)

    this._animation_left = createSignal()
    this._animation_top = createSignal()
  }
}

/* rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR */
const parseFen = (fen: string) =>
  fen.split('/').flatMap((line, j) => {
    let res: Piece[] = []
    let i = 0
    for (let c of line) {
      if (c >= '0' && c <= '8') {
        let n = parseInt(c)
        i += n
      } else {
        if (is_role(c)) {
          let role = c
          let file = FILES[i]
          let rank = RANKS[j]
          res.push({
            file,
            rank,
            role
          })
        }
        i++
      }
    }
    return res
  })

export const DuckBoard = (props: { orientation?: Color, fen: string }) => {

  const fen_pieces = createMemo(() => parseFen(props.fen))
  const orientation = createMemo(() => props.orientation ?? 'white')

  const is_flipped = createMemo(() => orientation() === 'black')

  const files = createMemo(() => is_flipped() ? FILES_REVERSED : FILES)
  const ranks = createMemo(() => is_flipped() ? RANKS_REVERSED : RANKS)


  const on_pieces_fresh = createMemo<OnPiece[]>(() => fen_pieces().map(piece => new OnPiece(piece, is_flipped())))

  const on_pieces_animated = createMemo<OnPiece[]>((prev?: OnPiece[]) => {
    let new_pieces = on_pieces_fresh()


    if (!prev) {
      return new_pieces
    }

    let old_pieces = prev
    let res: OnPiece[] = []

    batch(() => {
      new_pieces.forEach(_ => {
        let keeps = old_pieces.filter(old => _.piece.role === old.piece.role)
          .sort((a, b) => distance(a, _) - distance(b, _))

        if (keeps.length === 0) {
          res.push(_)
        } else {
          let old_keep = keeps[0]
          old_pieces = old_pieces.filter(_ => _ !== keeps[0])

          _.animation_left = { t: 0, start: old_keep.animated_left }
          _.animation_top = { t: 0, start: old_keep.animated_top }
          res.push(_)
        }
      })
    })

    return res
  })


  const has_animation = () => on_pieces_animated().some(_ => _.has_animation)

  createEffect(on(has_animation, (has_animation => {
    if (!has_animation) {
      return
    }


    let pieces = on_pieces_animated().filter(_ => _.has_animation)

    let i = requestAnimationFrame(step)

    let last: number | undefined
    function step(now: number) {
      let dt = (now - (last ?? now - 16)) / 1000

      let dur = 0.3

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

        i = requestAnimationFrame(step)
      })
    }

    onCleanup(() => {
      cancelAnimationFrame(i)
    })
  })))

  return (<>
  <div class='duckboard is2d'>
    <div class='files'>
      <For each={files()}>{ file => <div class='file'>{file}</div> }</For>
    </div>
    <div class='ranks'>
      <For each={ranks()}>{ rank => <div class='rank'>{rank}</div> }</For>
    </div>
    <div class='pieces'>
        <For each={on_pieces_animated()}>{piece => <Piece piece={piece}/>}</For>
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

const Piece = (props: { piece: OnPiece }) => {
  let klass = () => role_to_klass[props.piece.piece.role]
  let style = createMemo(() => `transform: translate(${props.piece.animated_left}%, ${props.piece.animated_top}%);`)

  return (<div class={'piece ' + klass()} style={style()}></div>)
}