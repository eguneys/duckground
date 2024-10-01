import { createSignal } from 'solid-js'
import './assets/theme.css'
import { Color, DuckBoard, DuckBoardState } from './DuckBoard'
import { makeFen, DuckChess, compat } from 'duckops'

function App() {


  let dd = DuckChess.default()
  let f = makeFen(dd.toSetup())

  const [state, set_state] = createSignal<DuckBoardState>('movepiece')
  const [fen, set_fen] = createSignal(f)
  const [orientation, set_orientation] = createSignal<Color>('white')

  document.addEventListener('keydown', e => {
    if (e.key === 'f') {
      set_orientation(orientation() === 'white' ? 'black' : 'white')
    }
  })

  return (<>
  <DuckBoard fen={fen()} orientation={orientation()} state={state()}/>
  <button onClick={() => {
    set_fen('8/8/2d5/3P4/8/8/8/8')
  }}>Set Endgame</button>
  <button onClick={() => {
    set_fen('8/8/3d4/3P4/8/8/8/8')
  }}>Set Endgame 2</button>

  <button onClick={() => {
      set_fen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')
  }}>Set Initial</button>
  </>)
}

export default App

