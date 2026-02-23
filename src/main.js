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

const PIECE_NAMES = { p: 'Pawn', r: 'Rook', n: 'Knight', b: 'Bishop', q: 'Queen', k: 'King' }

const SKILL_ICONS = {
  breeze: '🍃', freeze: '❄️', blink: '🌀', shield: '🛡️', rage: '🔥'
}

const SOUNDS = {
  move: 'https://images.chesscomfiles.com/chess-themes/sounds/_standard/default/move-self.mp3',
  capture: 'https://images.chesscomfiles.com/chess-themes/sounds/_standard/default/capture.mp3',
  select: 'https://images.chesscomfiles.com/chess-themes/sounds/_standard/default/piece-click.mp3',
  castle: 'https://images.chesscomfiles.com/chess-themes/sounds/_standard/default/castle.mp3',
  check: 'https://images.chesscomfiles.com/chess-themes/sounds/_standard/default/move-check.mp3',
  skill_collect: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
  skill_use: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
  victory: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3',
  shake: 'https://assets.mixkit.co/active_storage/sfx/2565/2565-preview.mp3'
}

function playSound(name) {
  try {
    const audio = new Audio(SOUNDS[name]);
    audio.volume = 0.5;
    audio.play();
  } catch (e) {
    console.error("Audio play failed", e);
  }
}

// --- State ---
let game = new Chess()
let selectedSquare = null
let gameMode = 'pve'
let aiLevel = 1
let engine = null

// Skill State
let inventory = { w: { breeze: 0, freeze: 0, blink: 0, shield: 0, rage: 0 }, b: { breeze: 0, freeze: 0, blink: 0, shield: 0, rage: 0 } }
let powerupsOnBoard = {} // square -> type
let activeCasting = null // Current skill being "aimed" (e.g., 'breeze')
let breezeTarget = null // Square of the piece being pushed
let activeShield = { w: false, b: false }
let isFrozen = false // If true, turn doesn't flip (move twice)
let rageTargets = [] // Squares of raging pawns

// --- UI Elements ---
const boardEl = document.getElementById('board')
const statusEl = document.getElementById('status')
const turnDot = document.getElementById('turn-dot')
const turnText = document.getElementById('turn-text')
const moveListEl = document.getElementById('move-list')
const aiLevelInput = document.getElementById('ai-level')
const lvlVal = document.getElementById('lvl-val')
const killBanner = document.getElementById('kill-banner')

// --- Init ---
function initEngine() {
  try {
    engine = new Worker('/stockfish.js')
    engine.onmessage = (e) => {
      const line = e.data
      if (line.startsWith('bestmove')) {
        const moveStr = line.split(' ')[1]
        if (moveStr && moveStr !== '(none)') makeEngineMove(moveStr)
      }
    }
    engine.postMessage('uci')
  } catch (err) { }
}

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
  spawnPowerup()
  updateBoard()
}

function spawnPowerup() {
  const squares = []
  for (let r = 1; r <= 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = String.fromCharCode(97 + f) + r
      // Strictly check if square is empty of pieces AND powerups
      if (!game.get(sq) && !powerupsOnBoard[sq]) {
        squares.push(sq)
      }
    }
  }
  if (squares.length > 0) {
    const target = squares[Math.floor(Math.random() * squares.length)]
    const types = ['breeze', 'freeze', 'blink', 'shield', 'rage']
    powerupsOnBoard[target] = types[Math.floor(Math.random() * types.length)]
  }
}

function updateBoard() {
  const squares = boardEl.querySelectorAll('.square')
  const turn = game.turn()

  if (turn === 'b' && !isFrozen) {
    boardEl.classList.add('rotate-black')
  } else if (turn === 'w' && !isFrozen) {
    boardEl.classList.remove('rotate-black')
  }

  squares.forEach(sq => {
    const squareName = sq.dataset.square
    const piece = game.get(squareName)
    sq.innerHTML = ''

    // Render Piece
    if (piece) {
      const pieceEl = document.createElement('div')
      pieceEl.classList.add('piece')
      pieceEl.style.backgroundImage = `url(${PIECES[piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase()]})`
      if (rageTargets.includes(squareName)) pieceEl.style.filter = 'drop-shadow(0 0 10px #f39c12) brightness(1.5)'
      sq.appendChild(pieceEl)
    }

    // Render Powerup
    if (powerupsOnBoard[squareName]) {
      const pEl = document.createElement('div')
      pEl.classList.add('skill-item')
      pEl.innerText = SKILL_ICONS[powerupsOnBoard[squareName]]
      sq.appendChild(pEl)
    }

    sq.classList.remove('selected', 'highlight-move', 'highlight-capture')
  })

  // Visual feedback for casting
  if (selectedSquare) {
    const selectedEl = boardEl.querySelector(`[data-square="${selectedSquare}"]`)
    selectedEl.classList.add('selected')

    // Highlight logic
    const moves = game.moves({ square: selectedSquare, verbose: true })

    // Add Blink moves for pawns
    if (activeCasting === 'blink') {
      const blinkMoves = getBlinkMoves(selectedSquare)
      blinkMoves.forEach(to => {
        const targetEl = boardEl.querySelector(`[data-square="${to}"]`)
        if (targetEl) targetEl.classList.add('highlight-move')
      })
    }

    moves.forEach(m => {
      const targetEl = boardEl.querySelector(`[data-square="${m.to}"]`)
      if (targetEl) {
        if (m.captured) targetEl.classList.add('highlight-capture')
        else targetEl.classList.add('highlight-move')
      }
    })
  }

  // Highlight Breeze options
  if (activeCasting === 'breeze' && breezeTarget) {
    const targetEl = boardEl.querySelector(`[data-square="${breezeTarget}"]`)
    if (targetEl) targetEl.classList.add('selected')

    // Highlight adjacent empty squares for target
    const adj = getAdjacentSquares(breezeTarget)
    adj.forEach(sq => {
      if (!game.get(sq)) {
        const el = boardEl.querySelector(`[data-square="${sq}"]`)
        if (el) el.classList.add('highlight-move')
      }
    })
  }

  updateInventoryUI()
  updateStatus()
  updateHistory()
}

function getAdjacentSquares(sq) {
  const file = sq.charCodeAt(0);
  const rank = parseInt(sq[1]);
  const results = [];
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const nf = String.fromCharCode(file + df);
      const nr = rank + dr;
      if (nf >= 'a' && nf <= 'h' && nr >= 1 && nr <= 8) {
        results.push(nf + nr);
      }
    }
  }
  return results;
}

function getBlinkMoves(sq) {
  const piece = game.get(sq)
  if (!piece || piece.type !== 'p') return []
  const file = sq[0], rank = parseInt(sq[1])
  const dir = piece.color === 'w' ? 1 : -1
  const blockingSq = file + (rank + dir)
  const targetSq = file + (rank + 2 * dir)

  if (rank + 2 * dir >= 1 && rank + 2 * dir <= 8) {
    const blocker = game.get(blockingSq)
    if (blocker && !game.get(targetSq)) return [targetSq]
  }
  return []
}

function updateInventoryUI() {
  const turn = game.turn()
  const inv = inventory[turn]
  for (const skill in inv) {
    const btn = document.getElementById(`skill-${skill}`)
    const countEl = document.getElementById(`count-${skill}`)
    if (countEl) countEl.innerText = inv[skill]
    if (btn) {
      btn.classList.toggle('collected', inv[skill] > 0)
      btn.classList.toggle('active-casting', activeCasting === skill)
    }
  }
}

function handleSquareClick(square) {
  if (game.isGameOver()) return
  const turn = game.turn()

  // Skill Usage Phase
  if (activeCasting) {
    applySkill(square)
    return
  }

  const piece = game.get(square)

  // Selection Phase
  if (piece && piece.color === turn) {
    selectedSquare = square
    playSound('select')
    updateBoard()
    return
  }

  // Move Phase
  if (selectedSquare) {
    // Check if it's a blink move
    if (activeCasting === 'blink' && getBlinkMoves(selectedSquare).includes(square)) {
      const p = game.remove(selectedSquare)
      game.put(p, square)
      inventory[turn].blink--
      activeCasting = null
      playSound('skill_use')
      animateMove({ from: selectedSquare, to: square, piece: p.type })
      finishTurn()
      return
    }

    try {
      const move = game.move({ from: selectedSquare, to: square, promotion: 'q' })
      if (move) {
        // Collect Powerup
        if (powerupsOnBoard[square]) {
          inventory[turn][powerupsOnBoard[square]]++
          delete powerupsOnBoard[square]
          playSound('skill_collect')
        }

        // Rage logic consumption
        if (activeCasting === 'rage' && move.piece === 'p') {
          inventory[turn].rage--
          activeCasting = null
          playSound('skill_use')
        }

        animateMove(move)
        selectedSquare = null

        if (isFrozen) {
          isFrozen = false;
          updateBoard();
          playSound('skill_use');
        } else {
          finishTurn()
        }
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

function applySkill(sq) {
  const turn = game.turn()
  const opp = turn === 'w' ? 'b' : 'w'

  if (activeCasting === 'breeze') {
    if (!breezeTarget) {
      const target = game.get(sq)
      if (target && target.color === opp) {
        if (activeShield[opp]) {
          activeShield[opp] = false
          statusEl.innerText = "SHIELD BLOCKED BREEZE!"
          inventory[turn].breeze--
          activeCasting = null
          playSound('skill_use')
        } else {
          breezeTarget = sq
          statusEl.innerText = "CHOOSE DESTINATION FOR PUSH"
        }
      } else {
        activeCasting = null
      }
    } else {
      // Choose destination
      const adj = getAdjacentSquares(breezeTarget)
      if (adj.includes(sq) && !game.get(sq)) {
        const p = game.remove(breezeTarget)
        game.put(p, sq)
        statusEl.innerText = "BREEZE PUSHED PIECE!"
        inventory[turn].breeze--
        playSound('skill_use')
        breezeTarget = null
        activeCasting = null
      } else if (sq === breezeTarget) {
        breezeTarget = null // Deselect
      }
    }
  } else {
    activeCasting = null
  }
  updateBoard()
}

function finishTurn() {
  if (Math.random() < 0.2) spawnPowerup()
  updateBoard()
}

// --- Skill Handlers ---
document.getElementById('skill-breeze').addEventListener('click', () => toggleSkill('breeze'))
document.getElementById('skill-freeze').addEventListener('click', () => {
  const turn = game.turn()
  const opp = turn === 'w' ? 'b' : 'w'
  if (inventory[turn].freeze > 0) {
    if (activeShield[opp]) {
      activeShield[opp] = false
      statusEl.innerText = "SHIELD BLOCKED FREEZE!"
    } else {
      isFrozen = true
      statusEl.innerText = "TIME FROZEN! MOVE AGAIN!"
    }
    inventory[turn].freeze--
    playSound('skill_use')
    updateBoard()
  }
})
document.getElementById('skill-blink').addEventListener('click', () => toggleSkill('blink'))
document.getElementById('skill-shield').addEventListener('click', () => {
  const turn = game.turn()
  if (inventory[turn].shield > 0) {
    activeShield[turn] = true
    inventory[turn].shield--
    statusEl.innerText = "SHIELD ACTIVATED!"
    playSound('skill_use')
    updateBoard()
  }
})
document.getElementById('skill-rage').addEventListener('click', () => toggleSkill('rage'))

function toggleSkill(skill) {
  const turn = game.turn()
  if (inventory[turn][skill] > 0) {
    activeCasting = (activeCasting === skill) ? null : skill
    breezeTarget = null
    updateBoard()
  }
}

// --- Original Logic Helpers ---

function animateMove(move) {
  if (move.captured) {
    playSound('capture')
    showKillBanner(move)
    document.body.classList.add('shake')
    setTimeout(() => document.body.classList.remove('shake'), 400)
  } else if (move.san.includes('O-O')) {
    playSound('castle')
  } else if (move.san.includes('+')) {
    playSound('check')
  } else {
    playSound('move')
  }
  updateBoard()
}

function showKillBanner(move) {
  const killer = PIECE_NAMES[move.piece].toUpperCase()
  const victim = PIECE_NAMES[move.captured].toUpperCase()
  killBanner.innerText = `${killer} OBLITERATED ${victim}`
  killBanner.classList.remove('active')
  void killBanner.offsetWidth
  killBanner.classList.add('active')
}

function updateStatus() {
  let status = ''
  let moveColor = game.turn() === 'w' ? 'White' : 'Black'

  if (game.isCheckmate()) {
    status = `CHECKMATE! ${moveColor === 'White' ? 'BLACK' : 'WHITE'} VICTORIOUS!`
    playSound('victory')
  }
  else if (game.isDraw()) status = 'STALEMATE'
  else {
    status = isFrozen ? "EXTRA TURN!" : `${moveColor.toUpperCase()}'S COMMAND`
    if (game.inCheck()) status = `🔥 ${moveColor.toUpperCase()} UNDER SIEGE 🔥`
  }

  statusEl.innerText = status
  turnDot.className = `dot ${game.turn() === 'w' ? 'white' : 'black'}`
  turnText.innerText = `${moveColor}'s Command`

  if (gameMode === 'pve' && game.turn() === 'b' && !game.isGameOver() && !isFrozen) {
    setTimeout(triggerAi, 1200)
  }
}

function triggerAi() {
  if (!engine) return
  const skill = (aiLevel - 1) * 5
  engine.postMessage(`setoption name Skill Level value ${skill}`)
  engine.postMessage(`position fen ${game.fen()}`)
  engine.postMessage(`go depth ${aiLevel + 3}`)
}

function makeEngineMove(moveStr) {
  try {
    const from = moveStr.substring(0, 2), to = moveStr.substring(2, 4), promotion = moveStr.substring(4, 5) || 'q'
    const move = game.move({ from, to, promotion })
    if (move) {
      // AI also collects powerups
      if (powerupsOnBoard[to]) {
        inventory[game.turn() === 'w' ? 'b' : 'w'][powerupsOnBoard[to]]++
        delete powerupsOnBoard[to]
      }
      animateMove(move)
    }
  } catch (e) { }
}

function updateHistory() {
  moveListEl.innerHTML = ''
  const history = game.history()
  for (let i = 0; i < history.length; i += 2) {
    const row = document.createElement('div')
    row.classList.add('move-row')

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
  powerupsOnBoard = {}
  inventory = { w: { breeze: 0, freeze: 0, blink: 0, shield: 0, rage: 0 }, b: { breeze: 0, freeze: 0, blink: 0, shield: 0, rage: 0 } }
  activeCasting = null
  breezeTarget = null
  createBoard()
})

document.getElementById('mode-pve').addEventListener('click', (e) => {
  gameMode = 'pve'
  e.target.classList.add('active')
  document.getElementById('mode-pvp').classList.remove('active')
})

document.getElementById('mode-pvp').addEventListener('click', (e) => {
  gameMode = 'pvp'
  e.target.classList.add('active')
  document.getElementById('mode-pve').classList.remove('active')
})

aiLevelInput.addEventListener('input', (e) => {
  aiLevel = parseInt(e.target.value)
  lvlVal.innerText = aiLevel
})

createBoard()
initEngine()
