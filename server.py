"""
server.py - Flask + Flask-SocketIO server for Bagh Blitz.
Run: python server.py
"""

import os
import json
from flask import Flask, render_template
from flask_socketio import SocketIO, emit, join_room as sio_join_room, leave_room as sio_leave_room

from room_manager import RoomManager

app = Flask(__name__)
app.config['SECRET_KEY'] = 'baghblitz_secret_2024'
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='threading')

rooms = RoomManager()
# ─── Visitor Logging Removed ──────────────────────────────────────────────────


# ─── Routes ─────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


# ─── Socket Events ──────────────────────────────────────────────────────────

@socketio.on('create_room')
def on_create_room(data):
    from flask import request
    sid   = request.sid
    name  = (data.get('name') or '').strip()
    gmail = (data.get('gmail') or '').strip()
    if not name or not gmail:
        emit('error', {'msg': 'Name and Gmail are required.'})
        return

    room = rooms.create_room(name, sid, gmail)
    sio_join_room(room['id'])

    emit('room_created', {
        'room_id': room['id'],
        'role': 'lion',
        'name': name,
        'players': [{'name': p['name'], 'role': p['role']} for p in room['players']],
        'node_positions': rooms.node_positions(),
        'adjacency': rooms.adjacency(),
    })


@socketio.on('join_room')
def on_join_room(data):
    from flask import request
    sid     = request.sid
    name    = (data.get('name') or '').strip()
    gmail   = (data.get('gmail') or '').strip()
    room_id = (data.get('room_id') or '').strip().upper()
    if not name or not room_id:
        emit('error', {'msg': 'Name and Room ID are required.'})
        return

    room, err = rooms.join_room(room_id, name, sid, gmail)
    if err:
        emit('error', {'msg': err})
        return

    sio_join_room(room_id)
    player_list = [{'name': p['name'], 'role': p['role']} for p in room['players']]

    emit('room_joined', {
        'room_id': room_id,
        'role': 'goat',
        'name': name,
        'players': player_list,
        'node_positions': rooms.node_positions(),
        'adjacency': rooms.adjacency(),
    })

    # Notify creator in room
    emit('player_joined', {'players': player_list}, to=room_id, include_self=False)


@socketio.on('start_game')
def on_start_game(data):
    from flask import request
    sid     = request.sid
    room_id = data.get('room_id', '')
    room, err = rooms.start_game(room_id, sid)
    if err:
        emit('error', {'msg': err})
        return

    emit('game_started', {
        'game_state': room['game_state'],
        'node_positions': rooms.node_positions(),
        'adjacency': rooms.adjacency(),
    }, to=room_id)


@socketio.on('make_move')
def on_make_move(data):
    from flask import request
    sid     = request.sid
    room_id = data.get('room_id', '')
    move    = data.get('move', {})
    client_role = data.get('role')

    print(f"[DEBUG] Room: {room_id}, SID: {sid}, Role: {client_role}, Move: {move}", flush=True)
    room, err = rooms.make_move(room_id, sid, move, client_role)
    if err:
        print(f"[DEBUG] Move error: {err}", flush=True)
        emit('error', {'msg': err})
        return

    print(f"[DEBUG] Move success. New turn: {room['game_state']['turn']}", flush=True)
    for p in room['players']:
        emit('move_result', {'game_state': room['game_state']}, to=p['sid'])


@socketio.on('chat_message')
def on_chat(data):
    from flask import request
    sid     = request.sid
    room_id = data.get('room_id', '')
    message = (data.get('message') or '').strip()
    if not message:
        return
    room = rooms.get_room(room_id)
    if not room:
        return
    sender = rooms.get_player_name(room, sid) or 'Player'
    entry  = rooms.add_chat(room_id, sender, message)
    emit('chat_broadcast', entry, to=room_id)


@socketio.on('restart_game')
def on_restart(data):
    room_id = data.get('room_id', '')
    room = rooms.restart_game(room_id)
    if room:
        emit('game_restarted', {
            'game_state': room['game_state'],
            'node_positions': rooms.node_positions(),
            'adjacency': rooms.adjacency(),
        }, to=room_id)


@socketio.on('leave_room')
def on_leave(data):
    from flask import request
    sid     = request.sid
    room_id = data.get('room_id', '')
    sio_leave_room(room_id)
    room, remaining = rooms.remove_player(sid)
    if room and remaining:
        emit('player_left', {
            'players': [{'name': p['name'], 'role': p['role']} for p in remaining],
            'msg': 'The other player has left the game.',
        }, to=room_id)


@socketio.on('disconnect')
def on_disconnect():
    from flask import request
    sid = request.sid
    room, remaining = rooms.remove_player(sid)
    if room and remaining:
        emit('player_left', {
            'players': [{'name': p['name'], 'role': p['role']} for p in remaining],
            'msg': 'The other player disconnected.',
        }, to=room['id'])


if __name__ == '__main__':
    print('🦁 Bagh Blitz server starting on http://localhost:5000')
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)
