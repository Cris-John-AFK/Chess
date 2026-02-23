import './style.css'
import { Chess } from 'chess.js'

// --- Configuration & Constants ---
const PIECES = {
  p: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
  r: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
  n: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
  b: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
  q: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
  k: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
  P: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
  R: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
  N: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
  B: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
  Q: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
  K: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg'
}

const PIECE_NAMES = {
  p: 'Pawn', r: 'Rook', n: 'Knight', b: 'Bishop', q: 'Queen', k: 'King'
}

// --- State ---
let game = new Chess()
let selectedSquare = null
let gameMode = 'pve'
let aiLevel = 1
let engine = null

// --- UI Elements ---
const boardEl = document.getElementById('board')
const statusEl = document.getElementById('status')
const turnDot = document.getElementById('turn-dot')
const turnText = document.getElementById('turn-text')
const moveListEl = document.getElementById('move-list')
const aiLevelInput = document.getElementById('ai-level')
const lvlVal = document.getElementById('lvl-val')
const aiSettings = document.getElementById('ai-settings')
const killBanner = document.getElementById('kill-banner')

// --- Init Engine ---
function initEngine() {
  try {
    engine = new Worker('/stockfish.js')
    engine.onmessage = (e) => {
      const line = e.data
      if (line.startsWith('bestmove')) {
        const moveStr = line.split(' ')[1]
        if (moveStr && moveStr !== '(none)') {
          makeEngineMove(moveStr)
        }
      }
    }
    engine.postMessage('uci')
  } catch (err) {
    console.error('Failed to init engine:', err)
  }
}

// --- Logic ---

function createBoard() {
  boardEl.innerHTML = ''
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const square = String.fromCharCode(97 + file) + (rank + 1)
      const squareEl = document.createElement('div')
      squareEl.classList.add('square')
      squareEl.classList.add((rank + file) % 2 === 0 ? 'dark' : 'light')
      squareEl.dataset.square = square
      squareEl.addEventListener('click', () => handleSquareClick(square))
      boardEl.appendChild(squareEl)
    }
  }
  updateBoard()
}

function updateBoard(animatedMove = null) {
  const squares = boardEl.querySelectorAll('.square')
  squares.forEach(sq => {
    const squareName = sq.dataset.square
    const piece = game.get(squareName)

    // If not the target of an animation, update normally
    if (!animatedMove || (squareName !== animatedMove.to && squareName !== animatedMove.from)) {
      sq.innerHTML = ''
      if (piece) {
        const pieceEl = createPieceElement(piece)
        sq.appendChild(pieceEl)
      }
    }

    sq.classList.remove('selected', 'highlight-move', 'highlight-capture')
  })

  if (selectedSquare) {
    const selectedEl = boardEl.querySelector(`[data-square="${selectedSquare}"]`)
    selectedEl.classList.add('selected')

    const moves = game.moves({ square: selectedSquare, verbose: true })
    moves.forEach(m => {
      const targetEl = boardEl.querySelector(`[data-square="${m.to}"]`)
      if (targetEl) {
        if (m.captured) {
          targetEl.classList.add('highlight-capture')
        } else {
          targetEl.classList.add('highlight-move')
        }
      }
    })
  }

  updateStatus()
  updateHistory()
}

function createPieceElement(piece) {
  const pieceEl = document.createElement('div')
  pieceEl.classList.add('piece')
  pieceEl.style.backgroundImage = `url(${PIECES[piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase()]})`
  return pieceEl
}

function animateMove(move) {
  const fromEl = boardEl.querySelector(`[data-square="${move.from}"]`)
  const toEl = boardEl.querySelector(`[data-square="${move.to}"]`)

  const pieceEl = fromEl.querySelector('.piece')
  if (!pieceEl) {
    updateBoard()
    return
  }

  const fromRect = fromEl.getBoundingClientRect()
  const toRect = toEl.getBoundingClientRect()

  const dx = toRect.left - fromRect.left
  const dy = toRect.top - fromRect.top

  // Capture logic
  if (move.captured) {
    createPoof(toEl)
    showKillBanner(move)
  }

  pieceEl.classList.add('piece-moving')
  pieceEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`

  setTimeout(() => {
    updateBoard()
  }, 400)
}

function createPoof(parentEl) {
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div')
    p.classList.add('poof-particle')
    const angle = Math.random() * Math.PI * 2
    const dist = 20 + Math.random() * 40
    p.style.left = '50%'
    p.style.top = '50%'
    parentEl.appendChild(p)

    requestAnimationFrame(() => {
      p.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0)`
    })

    setTimeout(() => p.remove(), 600)
  }
}

function showKillBanner(move) {
  const killer = PIECE_NAMES[move.piece].toUpperCase()
  const victim = PIECE_NAMES[move.captured].toUpperCase()
  killBanner.innerText = `${killer} OBLITERATED ${victim}`
  killBanner.classList.remove('active')
  void killBanner.offsetWidth // trigger reflow
  killBanner.classList.add('active')
}

function handleSquareClick(square) {
  if (game.isGameOver()) return

  const piece = game.get(square)

  // Selection
  if (piece && piece.color === game.turn()) {
    selectedSquare = square
    updateBoard()
    return
  }

  // Move
  if (selectedSquare) {
    try {
      const move = game.move({
        from: selectedSquare,
        to: square,
        promotion: 'q'
      })

      if (move) {
        animateMove(move)
        selectedSquare = null
      } else {
        selectedSquare = null
        updateBoard()
      }
    } catch (e) {
      selectedSquare = null
      updateBoard()
    }
  }
}

function updateStatus() {
  let status = ''
  let moveColor = game.turn() === 'w' ? 'White' : 'Black'

  if (game.isCheckmate()) {
    status = `CHECKMATE! ${moveColor === 'White' ? 'BLACK' : 'WHITE'} WINS!`
  } else if (game.isDraw()) {
    status = 'DRAW'
  } else {
    status = `${moveColor} to move`
    if (game.inCheck()) {
      status = `⚠ ${moveColor.toUpperCase()} IN CHECK`
    }
  }

  statusEl.innerText = status
  turnDot.className = `dot ${game.turn() === 'w' ? 'white' : 'black'}`
  turnText.innerText = `${moveColor}'s Turn`

  if (gameMode === 'pve' && game.turn() === 'b' && !game.isGameOver()) {
    setTimeout(triggerAi, 800)
  }
}

function triggerAi() {
  if (!engine) return
  statusEl.innerText = "Black AI is calculating..."
  const skill = (aiLevel - 1) * 5
  engine.postMessage(`setoption name Skill Level value ${skill}`)
  engine.postMessage(`position fen ${game.fen()}`)
  const depth = aiLevel + 3
  engine.postMessage(`go depth ${depth}`)
}

function makeEngineMove(moveStr) {
  try {
    const from = moveStr.substring(0, 2)
    const to = moveStr.substring(2, 4)
    const promotion = moveStr.substring(4, 5) || 'q'

    const move = game.move({ from, to, promotion })
    if (move) animateMove(move)
  } catch (e) {
    console.error('Engine move error:', e)
  }
}

function updateHistory() {
  moveListEl.innerHTML = ''
  const history = game.history()
  for (let i = 0; i < history.length; i += 2) {
    const row = document.createElement('div')
    row.style.display = 'contents'
    const num = document.createElement('span')
    num.classList.add('move-row-num')
    num.innerText = `${Math.floor(i / 2) + 1}.`
    const whiteMove = document.createElement('span')
    whiteMove.classList.add('move-val')
    whiteMove.innerText = history[i]
    row.appendChild(num)
    row.appendChild(whiteMove)
    if (history[i + 1]) {
      const blackMove = document.createElement('span')
      blackMove.classList.add('move-val')
      blackMove.innerText = history[i + 1]
      row.appendChild(blackMove)
    }
    moveListEl.appendChild(row)
  }
  moveListEl.scrollTop = moveListEl.scrollHeight
}

document.getElementById('reset-btn').addEventListener('click', () => {
  game = new Chess()
  selectedSquare = null
  createBoard()
})

document.getElementById('mode-pve').addEventListener('click', (e) => {
  gameMode = 'pve'
  e.target.classList.add('active')
  document.getElementById('mode-pvp').classList.remove('active')
  aiSettings.style.opacity = '1'
  aiSettings.style.pointerEvents = 'auto'
})

document.getElementById('mode-pvp').addEventListener('click', (e) => {
  gameMode = 'pvp'
  e.target.classList.add('active')
  document.getElementById('mode-pve').classList.remove('active')
  aiSettings.style.opacity = '0.3'
  aiSettings.style.pointerEvents = 'none'
})

aiLevelInput.addEventListener('input', (e) => {
  aiLevel = parseInt(e.target.value)
  lvlVal.innerText = aiLevel
})

createBoard()
initEngine()
