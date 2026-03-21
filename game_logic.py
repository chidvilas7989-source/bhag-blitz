"""
game_logic.py  –  Bagh Blitz: Triangle + Two Rectangles (24 nodes)

The board is a triangle (apex + 2 diagonals + center vertical) that passes
through two horizontally-aligned rectangles.  Nodes exist at every
intersection of triangle lines with rectangle edges.

Connections are ONLY:
  1. Rectangle edges  (horizontal + vertical between adjacent nodes)
  2. Triangle lines  (left diagonal, center vertical, right diagonal)
  3. Outer edges between rectangles and to the base

Node map (6 rows, top to bottom):
  Row 0  apex:           [0]
  Row 1  upper-rect top: [1,  2,  3,  4,  5]
  Row 2  upper-rect bot: [6,  7,  8,  9, 10]
  Row 3  lower-rect top: [11,12, 13, 14, 15]
  Row 4  lower-rect bot: [16,17, 18, 19, 20]
  Row 5  tri base:       [21, 22, 23]

Upper 11 (lion spawn): 0-10
Lower 13 (free):       11-23
"""

import random, copy, json, os

CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'board_config.json')
with open(CONFIG_PATH, 'r') as f:
    config = json.load(f)

NODE_POSITIONS = {int(k): tuple(v) for k, v in config['node_positions'].items()}
ADJACENCY = {int(k): v for k, v in config['adjacency'].items()}
UPPER_NODES = config['upper_nodes']
LOWER_NODES = config['lower_nodes']
LIONS_COUNT = config['game_settings']['lions_count']
GOATS_COUNT = config['game_settings']['goats_count']
LIONS_TO_WIN = config['game_settings']['lions_to_win']


def _get_jump_target(f, o):
    # Vector from from_node (f) to over_node (o)
    ax, ay = NODE_POSITIONS[f]; bx, by = NODE_POSITIONS[o]
    dx, dy = bx - ax, by - ay
    mag2_ab = dx*dx + dy*dy
    if mag2_ab == 0: return None

    # We look for a node 'c' adjacent to 'o' that continues the line f->o
    for c in ADJACENCY[o]:
        if c == f: continue
        cx, cy = NODE_POSITIONS[c]
        dcx, dcy = cx - bx, cy - by
        mag2_bc = dcx*dcx + dcy*dcy
        if mag2_bc == 0: continue
        
        dot = dx * dcx + dy * dcy
        # Check if vectors AB and BC are pointing in the same direction (collinear)
        # Cosine similarity squared > 0.9 (approx 18 degrees)
        if dot > 0 and (dot*dot) / (mag2_ab * mag2_bc) > 0.9:
            return c
    return None


def get_initial_state():
    board = [None] * 24
    
    # Zone definitions based on board rows
    # Fixed Lion starting positions: Apex (0), upper corners (1, 5), and bottom corners (21, 23)
    lion_indices = [0, 1, 5, 21, 23]
    for idx in lion_indices:
        board[idx] = 'lion'
        
    return {
        'board': board, 
        'phase': 'placement', 
        'turn': 'goat',
        'goats_to_place': GOATS_COUNT, 
        'goats_captured': 0,
        'game_over': False, 
        'winner': None,
        'history': []
    }


def get_lion_moves(state, node):
    board = state['board']
    moves = []
    
    # Move to adjacent empty nodes
    for nb in ADJACENCY[node]:
        if board[nb] is None:
            moves.append({'from': node, 'to': nb, 'capture': None})
            
    # Preserve jump captures
    for nb in ADJACENCY[node]:
        if board[nb] == 'goat':
            land = _get_jump_target(node, nb)
            if land is not None and board[land] is None:
                moves.append({'from': node, 'to': land, 'capture': nb})
    return moves


def get_goat_moves(state, node):
    return [{'from': node, 'to': nb, 'capture': None}
            for nb in ADJACENCY[node] if state['board'][nb] is None]


def all_lion_moves(state):
    m = []
    for i, p in enumerate(state['board']):
        if p == 'lion': m.extend(get_lion_moves(state, i))
    return m


def apply_move(state, move):
    s = copy.deepcopy(state)
    b = s['board']
    
    if s['phase'] == 'placement' and s['turn'] == 'goat':
        b[move['to']] = 'goat'
        s['goats_to_place'] -= 1
        if s['goats_to_place'] == 0: s['phase'] = 'movement'
        s['turn'] = 'lion'
        s.pop('active_piece', None)
    else:
        piece = b[move['from']]
        b[move['from']] = None
        b[move['to']] = piece
        cap = move.get('capture')
        
        if cap is not None:
            b[cap] = None
            if piece == 'lion':
                s['goats_captured'] += 1
            
            # Multi-capture logic for lions
            can_jump_again = False
            if piece == 'lion':
                # Check for more jumps from the new position
                for nb in ADJACENCY[move['to']]:
                    if b[nb] == 'goat':
                        land = _get_jump_target(move['to'], nb)
                        if land is not None and b[land] is None:
                            can_jump_again = True
                            break
            
            if can_jump_again:
                s['active_piece'] = move['to']
                # turn stays 'lion'
            else:
                s.pop('active_piece', None)
                s['turn'] = 'goat' if s['turn'] == 'lion' else 'lion'
        else:
            s.pop('active_piece', None)
            s['turn'] = 'goat' if s['turn'] == 'lion' else 'lion'

    # Board History (Hash)
    # We only track history after placement phase to avoid massive lists
    if s['phase'] == 'movement':
        board_hash = ",".join([str(x) for x in b])
        s['history'].append(board_hash)
        
        # 3-fold repetition check
        if s['history'].count(board_hash) >= 3:
            s['game_over'] = True
            s['winner'] = 'draw'

    # Win conditions
    remaining_goats = s['goats_to_place'] + b.count('goat')
    
    if s['goats_captured'] >= LIONS_TO_WIN or remaining_goats <= 6:
        s['game_over'] = True
        s['winner'] = 'lion'
    elif s['phase'] == 'movement' and not all_lion_moves(s):
        s['game_over'] = True
        s['winner'] = 'goat'
    
    s['board'] = b
    return s


def validate_move(state, move, role):
    if state['game_over'] or state['turn'] != role: return False
    
    # If in multi-capture, must move the active piece
    active = state.get('active_piece')
    if active is not None and move.get('from') != active:
        return False
    # If in multi-capture, must perform a capture
    if active is not None and move.get('capture') is None:
        return False

    b = state['board']
    if role == 'goat' and state['phase'] == 'placement':
        f, t = move.get('from'), move.get('to')
        if f is not None: return False # Goat cannot move pieces during placement
        return t is not None and 0 <= t < 24 and b[t] is None
    if role == 'goat' and state['phase'] == 'movement':
        f, t = move.get('from'), move.get('to')
        if f is None or t is None or b[f] != 'goat': return False
        return any(m['to'] == t for m in get_goat_moves(state, f))
    if role == 'lion':
        f, t, c = move.get('from'), move.get('to'), move.get('capture')
        if f is None or t is None or b[f] != 'lion': return False
        return any(m['to'] == t and m.get('capture') == c for m in get_lion_moves(state, f))
    return False
