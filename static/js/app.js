/* ═══════════════════════════════════════════════════════════════
   app.js  –  Bagh Blitz client: Socket.IO + page routing + UI
   ═══════════════════════════════════════════════════════════════ */

// ─── Global State ────────────────────────────────────────────────
const STATE = {
     socket: null,
     roomId: '',
     playerName: '',
     role: '',        // 'lion' | 'goat'
     isCreator: false,
     nodePositions: {},
     adjacency: {},
     gameState: null,
     phaserGame: null,
};
window.STATE = STATE;

// ─── Init ─────────────────────────────────────────────────────────
function initApp() {
     STATE.socket = io();
     bindSocketEvents();
     showPage('landing');
     // Open create accordion by default
     toggleAccordion('create');
}



// ─── Page Router ─────────────────────────────────────────────────
function showPage(name) {
     document.querySelectorAll('.page').forEach(p => {
          p.classList.remove('active');
          p.classList.add('hidden');
     });
     const target = document.getElementById(`page-${name}`);
     if (target) {
          target.classList.remove('hidden');
          target.classList.add('active');
     }
     // Kill Phaser when leaving game page
     if (name !== 'game' && STATE.phaserGame) {
          STATE.phaserGame.destroy(true);
          STATE.phaserGame = null;
     }
}

// ─── Accordion ────────────────────────────────────────────────────
function toggleAccordion(which) {
     const other = which === 'create' ? 'join' : 'create';
     ['create', 'join'].forEach(id => {
          const body = document.getElementById(`body-${id}`);
          const arrow = document.getElementById(`arrow-${id}`);
          if (id === which) {
               body.classList.toggle('open');
               arrow.classList.toggle('open');
          } else {
               body.classList.remove('open');
               arrow.classList.remove('open');
          }
     });
}

// ─── Landing Actions ──────────────────────────────────────────────
function createRoom() {
     const name = document.getElementById('create-name').value.trim();
     const gmail = document.getElementById('create-gmail').value.trim();
     if (!name || !gmail) { showLandingError('Name and Gmail are required.'); return; }
     if (!gmail.includes('@')) { showLandingError('Please enter a valid Gmail.'); return; }
     hideLandingError();
     STATE.socket.emit('create_room', { name, gmail });
}

function joinRoom() {
     const name = document.getElementById('join-name').value.trim();
     const roomId = document.getElementById('join-roomid').value.trim().toUpperCase();
     if (!name || !roomId) { showLandingError('Name and Room ID are required.'); return; }
     if (roomId.length !== 6) { showLandingError('Room ID must be 6 characters.'); return; }
     hideLandingError();
     STATE.socket.emit('join_room', { name, room_id: roomId, gmail: '' });
}

function showLandingError(msg) {
     const el = document.getElementById('landing-error');
     el.textContent = msg;
     el.classList.remove('hidden');
}
function hideLandingError() {
     document.getElementById('landing-error').classList.add('hidden');
}

// ─── Waiting Room ─────────────────────────────────────────────────
function updateWaitingPlayers(players) {
     const container = document.getElementById('waiting-players');
     container.innerHTML = players.map(p => `
    <div class="player-chip">
      <span>${p.name}</span>
      <span class="role-badge-${p.role}">${p.role === 'lion' ? '🦁 Lion' : '🐑 Goat'}</span>
    </div>
  `).join('');

     const status = document.getElementById('waiting-status');
     const btnStart = document.getElementById('btn-start');
     if (players.length >= 2) {
          status.textContent = 'Both players ready!';
          status.classList.remove('animate-pulse');
          if (STATE.isCreator) btnStart.classList.remove('hidden');
     } else {
          status.textContent = 'Waiting for another player…';
          status.classList.add('animate-pulse');
          btnStart.classList.add('hidden');
     }
}

function copyRoomId() {
     navigator.clipboard.writeText(STATE.roomId).then(() => {
          const toast = document.getElementById('copy-toast');
          toast.style.opacity = '1';
          setTimeout(() => toast.style.opacity = '0', 1500);
     });
}

function startGame() {
     STATE.socket.emit('start_game', { room_id: STATE.roomId });
}

// ─── Game Page ────────────────────────────────────────────────────
function initGamePage(gameState) {
     STATE.gameState = gameState;
     document.getElementById('game-room-id').textContent = STATE.roomId;
     updateTurnIndicator(gameState);
     updateSidebar(gameState);
     launchPhaser(gameState);
}

function updateTurnIndicator(gs) {
     const el = document.getElementById('turn-indicator');
     const myTurn = gs.turn === STATE.role;
     if (gs.turn === 'lion') {
          el.textContent = myTurn ? '🦁 Your Turn' : '🦁 Lion\'s Turn';
          el.className = 'turn-pill lion-turn';
     } else {
          el.textContent = myTurn ? '🐑 Your Turn' : '🐑 Goat\'s Turn';
          el.className = 'turn-pill goat-turn';
     }
}

function updateSidebar(gs) {
     document.getElementById('lion-captures').textContent = gs.goats_captured;
     document.getElementById('goats-on-board').textContent =
          (16 - gs.goats_to_place - gs.goats_captured);

     const btn = document.getElementById('btn-auto-place');
     if (btn) {
          if (STATE.role === 'goat' && gs.phase === 'placement' && gs.turn === 'goat') {
               btn.classList.remove('hidden');
          } else {
               btn.classList.add('hidden');
          }
     }

     // Populate side box with available goats (Now handled in Phaser)
     const pool = document.getElementById('sidebar-goats-pool');
     if (pool) {
          pool.classList.add('hidden');
     }
}

function autoPlaceGoat() {
     const gs = STATE.gameState;
     if (!gs || gs.phase !== 'placement' || STATE.role !== 'goat' || gs.turn !== 'goat') return;
     
     const emptyNodes = [];
     for (let i = 0; i < 24; i++) {
          if (gs.board[i] === null) emptyNodes.push(i);
     }
     if (emptyNodes.length > 0) {
          const randId = emptyNodes[Math.floor(Math.random() * emptyNodes.length)];
          const scene = STATE.phaserGame.scene.getScene('GameScene');
          if (scene) scene.sendMove({ to: randId });
     }
}

// ─── Hamburger / Chat ─────────────────────────────────────────────
function toggleHamburger() {
     const panel = document.getElementById('hamburger-panel');
     panel.classList.toggle('hidden');
}

function sendChat() {
     const input = document.getElementById('chat-input');
     const message = input.value.trim();
     if (!message) return;
     STATE.socket.emit('chat_message', { room_id: STATE.roomId, message });
     input.value = '';
}

function appendChat(entry) {
     const box = document.getElementById('chat-messages');
     const div = document.createElement('div');
     div.className = 'chat-msg';
     div.innerHTML = `<span class="chat-sender">${entry.sender}:</span> <span class="chat-text">${entry.message}</span>`;
     box.appendChild(div);
     box.scrollTop = box.scrollHeight;
}

// ─── Winning Page ─────────────────────────────────────────────────
function showWinningPage(gs) {
     const winnerRole = gs.winner;  // 'lion', 'goat' or 'draw'
     let winnerName = '', runnerName = '';
     
     // Find player names by role (fallback to role string if not found)
     winnerName = STATE.winInfo ? STATE.winInfo.winner_name : winnerRole;
     runnerName = STATE.winInfo ? STATE.winInfo.runner_name : '';

     document.getElementById('win-room-id').textContent = STATE.roomId;
     
     const winNameEl = document.getElementById('win-name');
     const winRoleEl = document.getElementById('win-role');
     const trophyEl = document.getElementById('win-trophy');

     if (winnerRole === 'draw') {
          winNameEl.textContent = 'Nobody';
          winRoleEl.textContent = '🤝 The game ended in a draw (repetition).';
          trophyEl.textContent = '🤝';
     } else {
          winNameEl.textContent = winnerName;
          winRoleEl.textContent = winnerRole === 'lion' ? '🦁 Lion wins by capturing/blocking goats!' : '🐑 Goats win by blocking all lions!';
          trophyEl.textContent = winnerRole === 'lion' ? '🦁' : '🐑';
     }

     document.getElementById('runner-name').textContent = runnerName;

     // Only creator can start Play Again (creator is always lion player)
     if (!STATE.isCreator) {
          document.getElementById('btn-play-again').classList.add('hidden');
     }

     showPage('winning');
}

function playAgain() {
     STATE.socket.emit('restart_game', { room_id: STATE.roomId });
}

// ─── Leave Modal ──────────────────────────────────────────────────
function showLeaveModal() {
     document.getElementById('leave-modal').classList.remove('hidden');
     document.getElementById('leave-modal').style.display = 'flex';
}
function hideLeaveModal() {
     document.getElementById('leave-modal').classList.add('hidden');
     document.getElementById('leave-modal').style.display = 'none';
}
function confirmLeave() {
     STATE.socket.emit('leave_room', { room_id: STATE.roomId });
     resetAndGoHome();
}
function resetAndGoHome() {
     hideLeaveModal();
     STATE.roomId = '';
     STATE.role = '';
     STATE.isCreator = false;
     STATE.gameState = null;
     STATE.winInfo = null;
     if (STATE.phaserGame) { STATE.phaserGame.destroy(true); STATE.phaserGame = null; }
     showPage('landing');
}

// ─── Toast ────────────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
     const t = document.getElementById('game-toast');
     t.textContent = msg;
     t.classList.remove('hidden');
     clearTimeout(t._timer);
     t._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

// ─── Phaser Launch ────────────────────────────────────────────────
function launchPhaser(gameState) {
     if (STATE.phaserGame) { STATE.phaserGame.destroy(true); STATE.phaserGame = null; }

     const container = document.getElementById('phaser-container');
     const W = Math.min(container.clientWidth - 20, 700);
     const H = Math.min(container.clientHeight - 20, 680);

     const config = {
          type: Phaser.AUTO,
          width: W,
          height: H,
          backgroundColor: '#080b12',
          transparent: true,
          parent: 'phaser-container',
          scene: [GameScene],
     };

     STATE.phaserGame = new Phaser.Game(config);
     // Pass data to scene via the registry (available after game creation)
     STATE.phaserGame.registry.set('gameState', gameState);
     STATE.phaserGame.registry.set('nodePositions', STATE.nodePositions);
     STATE.phaserGame.registry.set('adjacency', STATE.adjacency);
     STATE.phaserGame.registry.set('role', STATE.role);
     STATE.phaserGame.registry.set('roomId', STATE.roomId);
}

// ─── Socket Event Bindings ────────────────────────────────────────
function bindSocketEvents() {
     const s = STATE.socket;

     s.on('room_created', data => {
          STATE.roomId = data.room_id;
          STATE.playerName = data.name;
          STATE.role = data.role;
          STATE.isCreator = true;
          STATE.nodePositions = data.node_positions;
          STATE.adjacency = data.adjacency;
          window._roomPlayers = data.players;
          document.getElementById('waiting-room-id').textContent = data.room_id;
          updateWaitingPlayers(data.players);
          showPage('waiting');
     });

     s.on('room_joined', data => {
          STATE.roomId = data.room_id;
          STATE.playerName = data.name;
          STATE.role = data.role;
          STATE.isCreator = false;
          STATE.nodePositions = data.node_positions;
          STATE.adjacency = data.adjacency;
          window._roomPlayers = data.players;
          document.getElementById('waiting-room-id').textContent = data.room_id;
          updateWaitingPlayers(data.players);
          showPage('waiting');
     });

     s.on('player_joined', data => {
          window._roomPlayers = data.players;
          updateWaitingPlayers(data.players);
     });

     s.on('game_started', data => {
          STATE.nodePositions = data.node_positions || STATE.nodePositions;
          STATE.adjacency = data.adjacency || STATE.adjacency;
          showPage('game');
          initGamePage(data.game_state);
     });

     s.on('move_result', data => {
          STATE.gameState = data.game_state;
          updateTurnIndicator(data.game_state);
          updateSidebar(data.game_state);

          // Push updated state to Phaser
          if (STATE.phaserGame) {
               STATE.phaserGame.registry.set('gameState', data.game_state);
               const scene = STATE.phaserGame.scene.getScene('GameScene');
               if (scene) scene.syncState(data.game_state);
          }

          if (data.game_state.game_over) {
               setTimeout(() => showWinningPage(data.game_state), 1500);
          }
     });

     s.on('game_restarted', data => {
          STATE.gameState = data.game_state;
          STATE.nodePositions = data.node_positions || STATE.nodePositions;
          STATE.adjacency = data.adjacency || STATE.adjacency;
          STATE.winInfo = null;
          // Reset Play Again button
          document.getElementById('btn-play-again').classList.remove('hidden');
          showPage('game');
          initGamePage(data.game_state);
     });

     s.on('chat_broadcast', entry => {
          appendChat(entry);
     });

     s.on('player_left', data => {
          showToast(data.msg || 'The other player has left.');
          // Return to landing after short delay
          setTimeout(resetAndGoHome, 2500);
     });

     s.on('error', data => {
          showToast('⚠️ ' + (data.msg || 'Something went wrong.'));
          showLandingError(data.msg || 'Something went wrong.');
     });

     // Win info is injected by GameScene when it detects game_over
     s.on('win_info', data => {
          STATE.winInfo = data;
     });
}
