import { createSignal } from 'solid-js'
import './assets/theme.css'
import { Color, DuckBoard } from './DuckBoard'
import { makeFen, DuckChess } from 'duckops'

function App() {


  let dd = DuckChess.default()
  let f = makeFen(dd.toSetup())

  const [do_uci, set_do_uci] = createSignal<string | undefined>(undefined, { equals: false })
  const [fen, set_fen] = createSignal(f, { equals: false })
  const [orientation, set_orientation] = createSignal<Color>('white')

  const [do_takeback, set_do_takeback] = createSignal(undefined, { equals: false })

  document.addEventListener('keydown', e => {
    if (e.key === 'f') {
      set_orientation(orientation() === 'white' ? 'black' : 'white')
    }
  })

  return (<>
  <DuckBoard view_only='white' on_user_move={(uci: string) => console.log(uci)} fen={fen()} orientation={orientation()} do_takeback={do_takeback()} do_uci={do_uci()}/>
  <button onClick={() => {
    set_fen('8/8/2d5/3P4/8/8/8/8')
  }}>Set Endgame</button>
  <button onClick={() => {
    set_fen('8/8/3d4/3P4/8/8/8/8')
  }}>Set Endgame 2</button>

  <button onClick={() => {
    set_do_uci('h3@g7g6')
  }}>h3@g7g6</button>
  <button onClick={() => {
    set_do_takeback()
  }}>Takeback</button>
  <button onClick={() => {
      set_fen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
  }}>Set Initial</button>
  </>)
}

export default App

