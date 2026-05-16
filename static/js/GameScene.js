/* ═══════════════════════════════════════════════════════════════
   GameScene.js  –  Phaser 3: Container-based Node & Piece Management
   Every node is a Container holding its socket and its piece.
   ═══════════════════════════════════════════════════════════════ */

class GameScene extends Phaser.Scene {
     constructor() {
          super({ key: 'GameScene' });
          this.nodes = []; // Array of containers
          this.lineGfx = null;
          this.selectedNode = null; 
          this.validMoves = [];
          this.boardState = null; 
          this.role = ''; 
          this.sidebarGoats = [];
          this.selectedSidebarGoat = false;
          this.scaledPos = {};
          this.nodeRadius = 16; 
          this.pieceRadius = 14;
          this.hoverNode = null;
          this.lastBoard = null; 
     }

     get ADJACENCY() { return this.registry.get('adjacency'); }
     get VP() { return this.registry.get('nodePositions'); }

     create() {
          this.boardState = this.registry.get('gameState');
          this.role = this.registry.get('role');
          this.roomId = this.registry.get('roomId');
          
          this._scale(); 
          this.drawBoard(); 
          this.initNodes();
          this.renderPieces(); 
          this._hint();
     }

     update() {
          this.updateNodesFeedback();
     }

     _scale() {
          const W = this.scale.width, H = this.scale.height, VW = 500, VH = 580;
          const isPortrait = H > W;
          // Reserve space for sidebar on larger screens, otherwise just fit. In portrait, reserve space at bottom.
          const sidebarWidth = (!isPortrait && W > 600) ? 120 : 0;
          const sidebarHeight = isPortrait ? 120 : 0;
          
          const s = Math.min((W - 16 - sidebarWidth) / VW, (H - 16 - sidebarHeight) / VH);
          const ox = (W - (VW * s + sidebarWidth)) / 2, oy = (H - (VH * s + sidebarHeight)) / 2;
          this.scaledPos = {}; 
          this.nodeRadius = Math.max(8, 11 * s); 
          this.pieceRadius = Math.max(6, 8 * s);
          const vp = this.VP;
          for (let id = 0; id < 24; id++) {
               this.scaledPos[id] = { x: vp[id][0] * s + ox, y: vp[id][1] * s + oy };
          }
          
          this.isPortrait = isPortrait;
          if (isPortrait) {
               this.sidebarX = W / 2;
               this.sidebarY = oy + VH * s + 40;
          } else {
               this.sidebarX = ox + VW * s + 60;
               this.sidebarY = oy + 40;
          }
     }

     drawBoard() {
          if (this.lineGfx) this.lineGfx.destroy();
          const g = this.lineGfx = this.add.graphics();
          const p = this.scaledPos;

          // Draw adjacency lines
          g.lineStyle(2.5, 0x8b6914, 1);
          const vis = new Set(), adj = this.ADJACENCY;
          for (const [id, nbs] of Object.entries(adj)) {
               const a = +id;
               for (const b of nbs) {
                    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
                    if (vis.has(k)) continue; vis.add(k);
                    g.beginPath(); g.moveTo(p[a].x, p[a].y); g.lineTo(p[b].x, p[b].y); g.strokePath();
               }
          }
     }

     initNodes() {
          // Clear old nodes if any
          this.nodes.forEach(n => n.destroy());
          this.nodes = [];

          for (let id = 0; id < 24; id++) {
               const { x, y } = this.scaledPos[id];
               const node = this.add.container(x, y);
               
               // 1. Socket background
               const socket = this.add.graphics();
               this.drawSocket(socket);
               node.add(socket);
               node.socketGfx = socket;

               // 2. Feedback layer (for selection, validation, hover)
               const feedback = this.add.graphics();
               node.add(feedback);
               node.feedbackGfx = feedback;

               // 3. Piece reference
               node.piece = null;
               node.nodeId = id;

               // 4. Clickable area (using a child for better hit detection in containers)
               const hitArea = this.add.circle(0, 0, this.nodeRadius * 2)
                    .setInteractive({ useHandCursor: true })
                    .on('pointerdown', (pointer, localX, localY, event) => {
                         if (event) event.stopPropagation();
                         this.onNodeClick(id);
                    });
               node.add(hitArea);
               hitArea.setDepth(100); 
               node.hitArea = hitArea;

               this.nodes.push(node);
          }
     }

     drawSocket(g) {
          const NR = this.nodeRadius;
          g.clear();
          g.fillStyle(0x0a0a0a, 1); g.fillCircle(0, 0, NR + 5);
          g.lineStyle(2.5, 0x4b3621, 1); g.strokeCircle(0, 0, NR + 4);
          g.fillStyle(0x1a1208, 1); g.fillCircle(0, 0, NR + 2);
          g.lineStyle(1.5, 0x8b6914, 0.6); g.strokeCircle(0, 0, NR + 3);
     }

     updateNodesFeedback() {
          const NR = this.nodeRadius;
          for (let id = 0; id < 24; id++) {
               const node = this.nodes[id];
               const g = node.feedbackGfx;
               g.clear();

               const sel = this.selectedNode === id;
               const val = this.validMoves.some(m => m.to === id);
               const isHovered = this.hoverNode === id;

               if (sel) {
                    // Pulsing glow for selection
                    const pulse = 0.5 + Math.sin(this.time.now / 150) * 0.15;
                    g.fillStyle(0xf59e0b, 0.4 * pulse); g.fillCircle(0, 0, NR + 12);
                    g.lineStyle(3, 0xf59e0b, 1); g.strokeCircle(0, 0, NR + 12);
               } else if (isHovered && val) {
                    g.fillStyle(0x22d3ee, 0.7); g.fillCircle(0, 0, NR + 18);
                    g.lineStyle(4, 0x22d3ee, 1); g.strokeCircle(0, 0, NR + 18);
               } else if (isHovered && (this.selectedNode !== null || this.selectedSidebarGoat)) {
                    g.fillStyle(0xef4444, 0.3); g.fillCircle(0, 0, NR + 12);
                    g.lineStyle(2, 0xef4444, 0.8); g.strokeCircle(0, 0, NR + 12);
               } else if (val) {
                    // More prominent valid move indicators
                    g.fillStyle(0x22d3ee, 0.4); g.fillCircle(0, 0, NR + 10);
                    g.lineStyle(2.5, 0x22d3ee, 1.0); g.strokeCircle(0, 0, NR + 10);
                    // Add a tiny dot in the center
                    g.fillStyle(0x22d3ee, 1); g.fillCircle(0, 0, 4);
               } else if (this.boardState && this.boardState.board[id]) {
                    // Subtle glow when occupied
                    g.lineStyle(2, 0xffffff, 0.1);
                    g.strokeCircle(0, 0, NR + 7);
               }
          }
     }

     renderPieces() {
          const board = this.boardState.board;
          const activeId = this.boardState.active_piece;
          const my = this.boardState.turn === this.role;

          this.updateNodesFeedback();

          // Identify which piece moved to animate it
          let movedFrom = -1;
          let movedTo = -1;
          if (this.lastBoard) {
               for (let i = 0; i < 24; i++) {
                    if (this.lastBoard[i] && !board[i]) {
                         // Node i lost a piece. Did any node gain a piece of same type?
                         for (let j = 0; j < 24; j++) {
                              if (!this.lastBoard[j] && board[j] === this.lastBoard[i]) {
                                   movedFrom = i;
                                   movedTo = j;
                                   break;
                              }
                         }
                    }
               }
          }

          for (let id = 0; id < 24; id++) {
               const type = board[id];
               const node = this.nodes[id];

               if (type) {
                    // Update/Create piece
                    if (!node.piece || !node.piece.active || node.piece.type !== type) {
                         if (node.piece) node.piece.destroy();
                         
                         const pg = this.createPieceGraphic(type);
                         pg.type = type;
                         pg.nodeId = id;
                         node.add(pg);
                         node.piece = pg;
                         pg.setPosition(0, 0); // Default position

                         // Animation: If this is the destination of a move, animate from source
                         if (id === movedTo && movedFrom !== -1) {
                              const fromNode = this.nodes[movedFrom];
                              const dx = fromNode.x - node.x;
                              const dy = fromNode.y - node.y;
                              pg.setPosition(dx, dy);
                              this.tweens.add({
                                   targets: pg,
                                   x: 0, y: 0,
                                   duration: 350,
                                   ease: 'Power2.easeOut'
                              });
                         } else {
                              pg.setAlpha(0);
                              this.tweens.add({ targets: pg, alpha: 1, duration: 250 });
                         }
                    } else if (id === movedTo && movedFrom !== -1) {
                         // Already exists but should animate
                         const fromNode = this.nodes[movedFrom];
                         const dx = fromNode.x - node.x;
                         const dy = fromNode.y - node.y;
                         node.piece.setPosition(dx, dy);
                         this.tweens.add({
                              targets: node.piece,
                              x: 0, y: 0,
                              duration: 350,
                              ease: 'Power2.easeOut'
                         });
                    } else {
                         // Ensure centered if no move occurring
                         node.piece.setPosition(0, 0);
                    }
                    
                    const pg = node.piece;
                    let canMove = (activeId !== null && activeId !== undefined) 
                         ? (my && id === activeId) 
                         : (my && type === this.role && (this.boardState.phase === 'movement' || type === 'lion'));
                    
                    // Interaction
                    pg.disableInteractive();
                    if (canMove) {
                         this.setupPieceInteraction(pg, id, type);
                    }
                    pg.setAlpha(canMove ? 1.0 : (activeId !== null ? 0.3 : 1.0));
               } else {
                    if (node.piece) {
                         node.piece.destroy();
                         node.piece = null;
                    }
               }
          }
          
          this.lastBoard = [...board];
          this.renderSidebar();
     }

     renderSidebar() {
          const gs = this.boardState;
          if (!gs) return;

          const toPlace = gs.goats_to_place || 0;
          const myTurn = gs.turn === 'goat' && this.role === 'goat';

          if (this.sidebarGoatContainer) this.sidebarGoatContainer.destroy();
          this.sidebarGoatContainer = this.add.container(0, 0);

          if (toPlace > 0) {
               const cols = this.isPortrait ? 5 : 2;
               const startX = this.isPortrait 
                    ? this.sidebarX - ((Math.min(toPlace, cols) - 1) * this.pieceRadius * 1.5)
                    : this.sidebarX;
                    
               for (let i = 0; i < toPlace; i++) {
                    const r = Math.floor(i / cols);
                    const c = i % cols;
                    const x = this.isPortrait
                         ? startX + c * (this.pieceRadius * 3)
                         : this.sidebarX + c * (this.pieceRadius * 2.5);
                    const y = this.sidebarY + r * (this.pieceRadius * 2.5);

                    const pg = this.createPieceGraphic('goat');
                    pg.setPosition(x, y);
                    
                    if (myTurn) {
                         pg.setInteractive(new Phaser.Geom.Circle(0, 0, this.pieceRadius * 2.5), Phaser.Geom.Circle.Contains);
                         pg.on('pointerdown', () => this.onSidebarGoatClick());
                         
                         if (this.selectedSidebarGoat) {
                              pg.setScale(1.2);
                              this.tweens.add({ targets: pg, alpha: 0.7, duration: 500, yoyo: true, repeat: -1 });
                         }
                    } else {
                         pg.setAlpha(0.6);
                    }
                    
                    this.sidebarGoatContainer.add(pg);
                    if (i >= 19) break;
               }
               
               const labelX = this.isPortrait ? this.sidebarX : this.sidebarX - 25;
               const labelY = this.isPortrait ? this.sidebarY - 30 : this.sidebarY - 50;
               const label = this.add.text(labelX, labelY, `RESERVE: ${toPlace}`, {
                    fontSize: '16px', fontFamily: 'Outfit', color: '#fde68a', fontWeight: 'bold'
               });
               if (this.isPortrait) label.setOrigin(0.5, 0.5);
               this.sidebarGoatContainer.add(label);
          }
     }

     onSidebarGoatClick() {
          if (this.boardState.turn !== 'goat' || this.role !== 'goat') return;
          this.selectedSidebarGoat = !this.selectedSidebarGoat;
          this.selectedNode = null;
          this.validMoves = this.selectedSidebarGoat ? 
               this.boardState.board.map((v, i) => v === null ? { to: i } : null).filter(x => x) : [];
          
          if (this.selectedSidebarGoat) {
               this._hint("🐑 Tap an empty node to place the goat");
          }
          
          this.updateNodesFeedback();
          this.renderSidebar();
     }

     createPieceGraphic(type) {
          const PR = this.pieceRadius;
          const pg = this.add.container(0, 0);
          
          const shadow = this.add.graphics();
          shadow.fillStyle(0x000000, 0.4); shadow.fillCircle(2, 4, PR + 2);
          pg.add(shadow);

          const graphics = this.add.graphics();
          if (type === 'lion') {
               graphics.fillStyle(0x78350f, 1); graphics.fillCircle(0, 0, PR + 6);
               graphics.fillStyle(0xf59e0b, 1); graphics.fillCircle(0, 0, PR + 4);
               graphics.fillStyle(0xfde68a, 1); graphics.fillCircle(-PR/3, -PR/4, PR/1.8);
               graphics.lineStyle(2, 0xffffff, 0.3); graphics.strokeCircle(0, 0, PR + 4.5);
               graphics.lineStyle(2.5, 0x000000, 0.5); graphics.strokeCircle(0, 0, PR + 6);
          } 
          else {
               graphics.fillStyle(0x1e293b, 1); graphics.fillCircle(0, 0, PR + 4);
               graphics.fillStyle(0xe2e8f0, 1); graphics.fillCircle(0, 0, PR + 2);
               graphics.fillStyle(0xffffff, 1); graphics.fillCircle(-PR/3, -PR/4, PR/1.8);
               graphics.lineStyle(1.5, 0x000000, 0.2); graphics.strokeCircle(0, 0, PR + 2.5);
               graphics.lineStyle(2, 0x000000, 0.4); graphics.strokeCircle(0, 0, PR + 4);
               }
          pg.add(graphics);

          const ring = this.add.graphics();
          ring.lineStyle(1, 0xffffff, 0.1); ring.strokeCircle(0, 0, PR + 8);
          pg.add(ring);

          return pg;
     }

     setupPieceInteraction(pg, id, piece) {
          pg.setInteractive(new Phaser.Geom.Circle(0, 0, this.pieceRadius * 2.5), Phaser.Geom.Circle.Contains);

          pg.on('pointerdown', (pointer) => {
               console.log("[DEBUG] Piece Clicked ID:", id);
               this.onNodeClick(id);
          });

          pg.on('pointerover', () => { 
               this.input.setDefaultCursor('pointer'); 
               this.tweens.add({ targets: pg, scale: 1.25, duration: 200, ease: 'Back.easeOut' });
          });
          pg.on('pointerout', () => { 
               this.input.setDefaultCursor('default'); 
               this.tweens.add({ targets: pg, scale: 1.0, duration: 200, ease: 'Power2' });
          });
     }

     onNodeClick(id) {
          const gs = this.boardState, b = gs.board, my = gs.turn === this.role;
          console.log(`[DEBUG] onNodeClick(id:${id}) Phase:${gs.phase} Turn:${gs.turn} Me:${this.role} MyTurn:${my} SelSidebar:${this.selectedSidebarGoat} SelNode:${this.selectedNode}`);
          
          if (this.selectedNode !== null && this.selectedNode !== undefined) {
               const vm = this.validMoves.find(m => m.to === id);
               if (vm) { 
                    const movePacket = {
                         from: vm.from !== undefined ? vm.from : this.selectedNode,
                         to: vm.to,
                         capture: vm.capture !== undefined ? vm.capture : null
                    };
                    this.sendMove(movePacket); 
                    this.clearSel(); 
                    return; 
               }
          }

          if (gs.phase === 'placement' && this.role === 'goat' && my) {
               if (this.selectedSidebarGoat && b[id] === null) {
                    this.sendMove({ to: id }); 
                    this.selectedSidebarGoat = false;
                    this.clearSel(); 
               } else if (b[id] === null) {
                    this._hint("👉 Select a goat from the side first!");
               }
               return;
          }

          if (!my) return;
          if (gs.active_piece !== undefined && gs.active_piece !== null) {
               if (id !== gs.active_piece) {
                    this._hint("⚠️ You must continue jumping with the active piece!"); return;
               }
          }
          if (!b[id] || b[id] !== this.role) { this.clearSel(); return; }
          
          this.selectedNode = id;
          let pieceType = b[id];
          let moves = pieceType === 'lion' ? this._lionM(gs, id) : this._goatM(gs, id);
          if (gs.active_piece !== undefined && gs.active_piece !== null) {
               moves = moves.filter(m => m.capture !== null);
          }
          this.validMoves = moves;
          this.updateNodesFeedback();
     }

     clearSel() { 
          this.selectedNode = null; 
          this.selectedSidebarGoat = false;
          this.validMoves = []; 
          this.updateNodesFeedback(); 
     }

     handleDrop(x, y) {
          const gs = this.boardState;
          if (!gs || gs.phase !== 'placement' || this.role !== 'goat' || gs.turn !== 'goat') return;
          let droppedId = null;
          const NR = this.nodeRadius;
          for (let id = 0; id < 24; id++) {
               const node = this.scaledPos[id];
               const dist = Phaser.Math.Distance.Between(x, y, node.x, node.y);
               if (dist < NR * 4) { droppedId = id; break; }
          }
          if (droppedId !== null && gs.board[droppedId] === null) {
               this.sendMove({ to: droppedId });
          }
     }

     _lionM(gs, f) {
          const b = gs.board, m = [];
          for (const nb of this.ADJACENCY[f]) {
               if (b[nb] === null) m.push({ from: f, to: nb, capture: null });
          }
          for (const nb of this.ADJACENCY[f]) {
               if (b[nb] === 'goat') {
                    const l = this._jump(f, nb);
                    if (l !== null && b[l] === null) m.push({ from: f, to: l, capture: nb });
               }
          }
          return m;
     }

     _goatM(gs, f) {
          const m = [];
          for (const nb of this.ADJACENCY[f]) {
               if (gs.board[nb] === null) m.push({ from: f, to: nb, capture: null });
          }
          return m;
     }

     _jump(f, o) {
          const vp = this.VP;
          const ax = vp[f][0], ay = vp[f][1];
          const bx = vp[o][0], by = vp[o][1];
          const dx = bx - ax, dy = by - ay;
          const mag2_ab = dx*dx + dy*dy;
          if (mag2_ab === 0) return null;

          for (let c of this.ADJACENCY[o]) {
               if (c == f) continue;
               const cx = vp[c][0], cy = vp[c][1];
               const dcx = cx - bx, dcy = cy - by;
               const mag2_bc = dcx*dcx + dcy*dcy;
               if (mag2_bc === 0) continue;

               const dot = dx * dcx + dy * dcy;
               if (dot > 0 && (dot * dot) / (mag2_ab * mag2_bc) > 0.9) {
                    return c;
               }
          }
          return null;
     }

     sendMove(m) { 
          console.log("[DEBUG] Sending Move:", m, "Room:", this.roomId);
          if (window.STATE && window.STATE.socket) {
               window.STATE.socket.emit('make_move', { room_id: this.roomId, move: m, role: this.role }); 
          }
     }

     syncState(s) { 
          const turnColor = s.turn === 'lion' ? '🦁 LION' : '🐑 GOAT';
          if (s.turn !== this.boardState?.turn) { this._hint(`${turnColor}'S TURN`); }
          this.boardState = s; 
          this.selectedSidebarGoat = false;
          this.clearSel(); 
          
          // Auto-select active piece for multi-capture
          if (s.active_piece !== undefined && s.active_piece !== null && s.turn === this.role) {
               this.onNodeClick(s.active_piece);
          }
          
          this.renderPieces(); 
          if (s.game_over) this._overlay(s.winner); 
     }

     _hint(msg) {
          const gs = this.boardState; if (!gs || gs.game_over) return;
          const h = msg || (gs.phase === 'placement' ? 
               (gs.turn === 'goat' && this.role === 'goat' ? '🐑 Place your goat' : '🐑 Goat placing...') :
               (gs.turn === this.role ? '✨ Your turn to move' : '⏳ Waiting...'));
          if (window.showToast) window.showToast(h, 2500);
     }

     _overlay(w) {
          const W = this.scale.width, H = this.scale.height;
          this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6);
          
          let title = '';
          let color = '#ffffff';
          if (w === 'lion') { title = '🦁 Lions Win!'; color = '#f59e0b'; }
          else if (w === 'goat') { title = '🐑 Goats Win!'; color = '#e2e8f0'; }
          else { title = '🤝 It\'s a Draw!'; color = '#94a3b8'; }

          this.add.text(W / 2, H / 2, title, {
               fontSize: '32px', fontFamily: 'Outfit', color: color,
               stroke: '#000', strokeThickness: 6
          }).setOrigin(0.5);

          if (w === 'draw') return;

          const pl = window._roomPlayers || [], lr = w === 'lion' ? 'goat' : 'lion';
          const wp = pl.find(p => p.role === w) || { name: w }, lp = pl.find(p => p.role === lr) || { name: lr };
          if (window.STATE) window.STATE.winInfo = { winner_name: wp.name, runner_name: lp.name };
     }
}
