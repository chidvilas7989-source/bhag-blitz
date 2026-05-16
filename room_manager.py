"""
room_manager.py - Room lifecycle: create, join, start, move, restart.
"""

import random
import string
from game_logic import get_initial_state, validate_move, apply_move, NODE_POSITIONS, ADJACENCY


def _gen_room_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


class RoomManager:
    def __init__(self):
        self.rooms = {}  # room_id -> room dict

    def _new_room(self, creator_name, creator_sid, gmail, creator_uid):
        room_id = _gen_room_id()
        while room_id in self.rooms:
            room_id = _gen_room_id()
        self.rooms[room_id] = {
            'id': room_id,
            'players': [
                {'uid': creator_uid, 'sid': creator_sid, 'name': creator_name, 'role': 'lion', 'gmail': gmail, 'online': True}
            ],
            'creator_sid': creator_sid,
            'creator_uid': creator_uid,
            'game_state': None,
            'chat': [],
            'started': False,
        }
        return self.rooms[room_id]

    def create_room(self, creator_name, creator_sid, gmail, creator_uid):
        room = self._new_room(creator_name, creator_sid, gmail, creator_uid)
        return room

    def join_room(self, room_id, name, sid, gmail, uid):
        room = self.rooms.get(room_id)
        if not room:
            return None, 'Room not found'
        if len(room['players']) >= 2:
            return None, 'Room is full'
        if room['started']:
            return None, 'Game already started'
        room['players'].append({'uid': uid, 'sid': sid, 'name': name, 'role': 'goat', 'gmail': gmail, 'online': True})
        return room, None

    def get_room_by_sid(self, sid):
        for room in self.rooms.values():
            for p in room['players']:
                if p['sid'] == sid:
                    return room
        return None

    def get_room_by_uid(self, uid):
        for room in self.rooms.values():
            for p in room['players']:
                if p.get('uid') == uid:
                    return room
        return None

    def get_player_role(self, room, sid):
        for p in room['players']:
            if p['sid'] == sid:
                return p['role']
        return None

    def get_player_name(self, room, sid):
        for p in room['players']:
            if p['sid'] == sid:
                return p['name']
        return None

    def start_game(self, room_id, requester_sid):
        room = self.rooms.get(room_id)
        if not room:
            return None, 'Room not found'
        if room['creator_sid'] != requester_sid:
            return None, 'Only creator can start'
        if len(room['players']) < 2:
            return None, 'Need 2 players'
        room['game_state'] = get_initial_state()
        room['started'] = True
        return room, None

    def make_move(self, room_id, sid, move, client_role=None):
        room = self.rooms.get(room_id)
        if not room or not room['game_state']:
            return None, 'Room/game not found'
        
        role = None
        for p in room['players']:
            if p['sid'] == sid:
                role = p['role']
                break
                
        if not role and client_role:
            for p in room['players']:
                if p['role'] == client_role:
                    p['sid'] = sid
                    role = client_role
                    break

        if not role:
            return None, 'Player not in room'
            
        state = room['game_state']
        if not validate_move(state, move, role):
            print(f"[DEBUG] Validation failed for {role}: {move} in phase {state['phase']}")
            return None, 'Invalid move'
        room['game_state'] = apply_move(state, move)
        return room, None

    def restart_game(self, room_id):
        room = self.rooms.get(room_id)
        if not room:
            return None
        room['game_state'] = get_initial_state()
        return room

    def add_chat(self, room_id, sender, message):
        room = self.rooms.get(room_id)
        if room:
            entry = {'sender': sender, 'message': message}
            room['chat'].append(entry)
            return entry
        return None

    def mark_player_offline(self, sid):
        room = self.get_room_by_sid(sid)
        if not room:
            return None, []
        for p in room['players']:
            if p['sid'] == sid:
                p['online'] = False
        
        # If no one is online and game hasn't started, maybe clean up
        active = sum(1 for p in room['players'] if p['online'])
        if active == 0 and not room['started']:
            del self.rooms[room['id']]
            return None, []
            
        return room, room['players']

    def remove_player_completely(self, sid):
        room = self.get_room_by_sid(sid)
        if not room:
            return None, []
        room['players'] = [p for p in room['players'] if p['sid'] != sid]
        if not room['players']:
            del self.rooms[room['id']]
            return None, []
        if room['creator_sid'] == sid and room['players']:
            room['creator_sid'] = room['players'][0]['sid']
            room['creator_uid'] = room['players'][0].get('uid')
            room['players'][0]['role'] = 'lion'
        return room, room['players']

    def rejoin_room(self, room_id, uid, new_sid):
        room = self.rooms.get(room_id)
        if not room: return None, "Room not found"
        for p in room['players']:
            if p.get('uid') == uid:
                p['sid'] = new_sid
                p['online'] = True
                if room['creator_uid'] == uid:
                    room['creator_sid'] = new_sid
                return room, None
        return None, "Player not in room"

    def get_room(self, room_id):
        return self.rooms.get(room_id)

    def room_info(self, room):
        """Safe serializable room info."""
        return {
            'id': room['id'],
            'players': [{'name': p['name'], 'role': p['role']} for p in room['players']],
            'started': room['started'],
        }

    def node_positions(self):
        return {str(k): list(v) for k, v in NODE_POSITIONS.items()}

    def adjacency(self):
        return {str(k): list(v) for k, v in ADJACENCY.items()}
