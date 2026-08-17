import datetime
import socketio
from typing import Dict, Any
from sqlalchemy import select, delete, or_
from sqlalchemy.orm import selectinload
from app.database import AsyncSessionLocal
from app.models import User, Message, Reaction, Channel, ServerMember, DMConversation, DirectMessage
from app.auth import decode_token

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=[],
    max_http_buffer_size=10_000_000  # 10 MB limit for file attachments
)

# In-memory mappings
# sid -> user dict
sid_to_user: Dict[str, dict] = {}
# user_id -> set of sids
user_to_sids: Dict[int, set] = {}
# voice_channel_id -> dict of user_id: { username, avatar_url, status, is_screen_sharing }
voice_room_users: Dict[int, Dict[int, dict]] = {}
# voice_channel_id -> ISO timestamp string when call started
voice_room_started_at: Dict[int, str] = {}
# voice_channel_id -> watch together session state
# { video_id, is_playing, current_time, last_updated, title }
watch_room_state: Dict[int, dict] = {}

@sio.event
async def connect(sid, environ, auth=None):
    token = None
    if auth and isinstance(auth, dict) and "token" in auth:
        token = auth["token"]
    
    if not token:
        # Check query string
        query_string = environ.get('QUERY_STRING', '')
        for param in query_string.split('&'):
            if param.startswith('token='):
                token = param.split('=')[1]
                break

    if not token:
        return False  # Refuse connection without auth

    payload = decode_token(token)
    if not payload or "sub" not in payload:
        return False

    user_id = int(payload["sub"])
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.id == user_id))
        user = res.scalar_one_or_none()
        if not user:
            return False

        user_data = {
            "id": user.id,
            "username": user.username,
            "avatar_url": user.avatar_url,
            "status": user.status,
            "status_message": user.status_message
        }

    sid_to_user[sid] = user_data
    if user_id not in user_to_sids:
        user_to_sids[user_id] = set()
    user_to_sids[user_id].add(sid)

    # Broadcast presence
    await sio.emit("user_connected", user_data)

    # Send existing voice rooms state to connecting user
    for ch_id, users_dict in voice_room_users.items():
        if users_dict:
            await sio.emit("voice_room_update", {
                "channel_id": ch_id,
                "users": list(users_dict.values()),
                "started_at": voice_room_started_at.get(ch_id)
            }, to=sid)

    # Send any active watch together session state to connecting user
    for ch_id, watch_state in watch_room_state.items():
        if watch_state.get("video_id"):
            await sio.emit("watch_sync", {
                "channel_id": ch_id,
                "type": "state_sync",
                **watch_state
            }, to=sid)

    return True

@sio.event
async def disconnect(sid):
    if sid in sid_to_user:
        user_data = sid_to_user.pop(sid)
        user_id = user_data["id"]
        if user_id in user_to_sids:
            user_to_sids[user_id].discard(sid)
            if not user_to_sids[user_id]:
                del user_to_sids[user_id]
                # User has no more active socket connections
                await sio.emit("user_disconnected", {"user_id": user_id})

        # Remove from voice rooms if connected
        for ch_id, users in list(voice_room_users.items()):
            if user_id in users:
                del users[user_id]
                started_at = voice_room_started_at.get(ch_id)
                if not users:
                    if ch_id in voice_room_started_at:
                        del voice_room_started_at[ch_id]
                    started_at = None

                await sio.emit("voice_room_update", {
                    "channel_id": ch_id,
                    "users": list(users.values()),
                    "started_at": started_at
                })

@sio.event
async def join_channel(sid, data):
    channel_id = data.get("channel_id")
    if channel_id:
        room_name = f"channel_{channel_id}"
        await sio.enter_room(sid, room_name)

@sio.event
async def leave_channel(sid, data):
    channel_id = data.get("channel_id")
    if channel_id:
        room_name = f"channel_{channel_id}"
        await sio.leave_room(sid, room_name)

@sio.event
async def send_message(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return

    channel_id = data.get("channel_id")
    content = data.get("content", "").strip()
    attachments_json = data.get("attachments_json")

    if not channel_id or not content:
        return

    async with AsyncSessionLocal() as db:
        new_msg = Message(
            channel_id=channel_id,
            user_id=user_data["id"],
            content=content,
            attachments_json=attachments_json
        )
        db.add(new_msg)
        await db.commit()

        # Fetch message with relationships
        res = await db.execute(
            select(Message)
            .options(
                selectinload(Message.author),
                selectinload(Message.reactions)
            )
            .where(Message.id == new_msg.id)
        )
        full_msg = res.scalar_one()

        msg_dict = {
            "id": full_msg.id,
            "channel_id": full_msg.channel_id,
            "user_id": full_msg.user_id,
            "content": full_msg.content,
            "attachments_json": full_msg.attachments_json,
            "created_at": full_msg.created_at.isoformat(),
            "author": {
                "id": full_msg.author.id,
                "username": full_msg.author.username,
                "avatar_url": full_msg.author.avatar_url,
                "status": full_msg.author.status
            },
            "reactions": []
        }

    await sio.emit("new_message", msg_dict, room=f"channel_{channel_id}")

@sio.event
async def add_reaction(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return

    message_id = data.get("message_id")
    emoji = data.get("emoji")
    channel_id = data.get("channel_id")

    if not message_id or not emoji:
        return

    async with AsyncSessionLocal() as db:
        # Check if reaction exists
        res = await db.execute(
            select(Reaction)
            .where(
                Reaction.message_id == message_id,
                Reaction.user_id == user_data["id"],
                Reaction.emoji == emoji
            )
        )
        existing = res.scalar_one_or_none()
        if not existing:
            new_react = Reaction(
                message_id=message_id,
                user_id=user_data["id"],
                emoji=emoji
            )
            db.add(new_react)
            await db.commit()

        # Fetch updated reactions for this message
        res = await db.execute(
            select(Reaction).where(Reaction.message_id == message_id)
        )
        reactions = res.scalars().all()
        reactions_list = [{"id": r.id, "emoji": r.emoji, "user_id": r.user_id} for r in reactions]

    await sio.emit("reaction_updated", {
        "message_id": message_id,
        "reactions": reactions_list
    }, room=f"channel_{channel_id}")

@sio.event
async def remove_reaction(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return

    message_id = data.get("message_id")
    emoji = data.get("emoji")
    channel_id = data.get("channel_id")

    async with AsyncSessionLocal() as db:
        await db.execute(
            delete(Reaction)
            .where(
                Reaction.message_id == message_id,
                Reaction.user_id == user_data["id"],
                Reaction.emoji == emoji
            )
        )
        await db.commit()

        res = await db.execute(
            select(Reaction).where(Reaction.message_id == message_id)
        )
        reactions = res.scalars().all()
        reactions_list = [{"id": r.id, "emoji": r.emoji, "user_id": r.user_id} for r in reactions]

    await sio.emit("reaction_updated", {
        "message_id": message_id,
        "reactions": reactions_list
    }, room=f"channel_{channel_id}")

@sio.event
async def typing_start(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = data.get("channel_id")
    if user_data and channel_id:
        await sio.emit("user_typing", {
            "user_id": user_data["id"],
            "username": user_data["username"],
            "channel_id": channel_id,
            "is_typing": True
        }, room=f"channel_{channel_id}", skip_sid=sid)

@sio.event
async def typing_stop(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = data.get("channel_id")
    if user_data and channel_id:
        await sio.emit("user_typing", {
            "user_id": user_data["id"],
            "username": user_data["username"],
            "channel_id": channel_id,
            "is_typing": False
        }, room=f"channel_{channel_id}", skip_sid=sid)

# --- Voice & Video WebRTC Signaling ---

@sio.event
async def join_voice(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return

    channel_id = data.get("channel_id")
    if not channel_id:
        return

    room_name = f"voice_{channel_id}"
    await sio.enter_room(sid, room_name)

    if channel_id not in voice_room_users or len(voice_room_users[channel_id]) == 0:
        voice_room_users[channel_id] = {}
        voice_room_started_at[channel_id] = datetime.datetime.utcnow().isoformat()

    user_info = {
        "id": user_data["id"],
        "username": user_data["username"],
        "avatar_url": user_data["avatar_url"],
        "is_screen_sharing": False
    }
    voice_room_users[channel_id][user_data["id"]] = user_info

    # Broadcast voice room state to ALL clients so sidebar updates
    await sio.emit("voice_room_update", {
        "channel_id": channel_id,
        "users": list(voice_room_users[channel_id].values()),
        "started_at": voice_room_started_at.get(channel_id)
    })

@sio.event
async def leave_voice(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = data.get("channel_id")
    if user_data and channel_id:
        room_name = f"voice_{channel_id}"
        await sio.leave_room(sid, room_name)
        if channel_id in voice_room_users and user_data["id"] in voice_room_users[channel_id]:
            del voice_room_users[channel_id][user_data["id"]]
            if len(voice_room_users[channel_id]) == 0:
                if channel_id in voice_room_started_at:
                    del voice_room_started_at[channel_id]
            started_at = voice_room_started_at.get(channel_id)
            await sio.emit("voice_room_update", {
                "channel_id": channel_id,
                "users": list(voice_room_users[channel_id].values()),
                "started_at": started_at
            })

def get_target_sids(target_user_id):
    if target_user_id is None:
        return set()
    sids = user_to_sids.get(target_user_id, set())
    if not sids:
        try:
            sids = user_to_sids.get(int(target_user_id), set())
        except (ValueError, TypeError):
            pass
    if not sids:
        try:
            sids = user_to_sids.get(str(target_user_id), set())
        except (ValueError, TypeError):
            pass
    return sids

@sio.event
async def voice_offer(sid, data):
    target_user_id = data.get("target_user_id")
    user_data = sid_to_user.get(sid)
    if target_user_id and user_data:
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("voice_offer", {
                "sender_id": user_data["id"],
                "sender_username": user_data["username"],
                "offer": data.get("offer"),
                "channel_id": data.get("channel_id")
            }, to=tsid)

@sio.event
async def voice_answer(sid, data):
    target_user_id = data.get("target_user_id")
    user_data = sid_to_user.get(sid)
    if target_user_id and user_data:
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("voice_answer", {
                "sender_id": user_data["id"],
                "answer": data.get("answer"),
                "channel_id": data.get("channel_id")
            }, to=tsid)

@sio.event
async def voice_ice_candidate(sid, data):
    target_user_id = data.get("target_user_id")
    user_data = sid_to_user.get(sid)
    if target_user_id and user_data:
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("voice_ice_candidate", {
                "sender_id": user_data["id"],
                "candidate": data.get("candidate"),
                "channel_id": data.get("channel_id")
            }, to=tsid)

@sio.event
async def toggle_screen_share(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = data.get("channel_id")
    is_sharing = data.get("is_sharing", False)
    if user_data and channel_id in voice_room_users:
        if user_data["id"] in voice_room_users[channel_id]:
            voice_room_users[channel_id][user_data["id"]]["is_screen_sharing"] = is_sharing
            await sio.emit("voice_room_update", {
                "channel_id": channel_id,
                "users": list(voice_room_users[channel_id].values())
            }, room=f"voice_{channel_id}")

@sio.event
async def voice_audio_chunk(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = data.get("channel_id")
    chunk = data.get("chunk")
    if user_data and channel_id and chunk:
        await sio.emit("voice_audio_chunk", {
            "user_id": user_data["id"],
            "username": user_data["username"],
            "avatar_url": user_data["avatar_url"],
            "channel_id": channel_id,
            "chunk": chunk
        }, room=f"voice_{channel_id}", skip_sid=sid)

# --- WebRTC P2P File Transfer Signaling ---

@sio.event
async def p2p_file_offer(sid, data):
    user_data = sid_to_user.get(sid)
    target_user_id = data.get("target_user_id")
    if user_data and target_user_id:
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("p2p_file_offer", {
                "sender": user_data,
                "transfer_id": data.get("transfer_id"),
                "file_name": data.get("file_name"),
                "file_size": data.get("file_size"),
                "file_type": data.get("file_type"),
                "offer": data.get("offer")
            }, to=tsid)

@sio.event
async def p2p_file_answer(sid, data):
    user_data = sid_to_user.get(sid)
    target_user_id = data.get("target_user_id")
    if user_data and target_user_id:
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("p2p_file_answer", {
                "sender_id": user_data["id"],
                "transfer_id": data.get("transfer_id"),
                "answer": data.get("answer")
            }, to=tsid)

@sio.event
async def p2p_file_ice(sid, data):
    user_data = sid_to_user.get(sid)
    target_user_id = data.get("target_user_id")
    if user_data and target_user_id:
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("p2p_file_ice", {
                "sender_id": user_data["id"],
                "transfer_id": data.get("transfer_id"),
                "candidate": data.get("candidate")
            }, to=tsid)

@sio.event
async def p2p_file_cancel(sid, data):
    user_data = sid_to_user.get(sid)
    target_user_id = data.get("target_user_id")
    if user_data and target_user_id:
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("p2p_file_cancel", {
                "transfer_id": data.get("transfer_id")
            }, to=tsid)


# --- Direct Messaging Socket Events ---

@sio.event
async def join_dm(sid, data):
    conversation_id = data.get("conversation_id")
    if conversation_id:
        await sio.enter_room(sid, f"dm_{conversation_id}")

@sio.event
async def leave_dm(sid, data):
    conversation_id = data.get("conversation_id")
    if conversation_id:
        await sio.leave_room(sid, f"dm_{conversation_id}")

@sio.event
async def send_dm_message(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return

    conversation_id = data.get("conversation_id")
    content = data.get("content", "").strip()
    attachments_json = data.get("attachments_json")

    if not conversation_id or not content:
        return

    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(DMConversation).where(
                DMConversation.id == conversation_id,
                or_(
                    DMConversation.user1_id == user_data["id"],
                    DMConversation.user2_id == user_data["id"]
                )
            )
        )
        conv = res.scalar_one_or_none()
        if not conv:
            return

        target_user_id = conv.user2_id if conv.user1_id == user_data["id"] else conv.user1_id

        new_dm = DirectMessage(
            conversation_id=conversation_id,
            sender_id=user_data["id"],
            content=content,
            attachments_json=attachments_json
        )
        db.add(new_dm)
        await db.commit()

        res = await db.execute(
            select(DirectMessage)
            .options(selectinload(DirectMessage.sender))
            .where(DirectMessage.id == new_dm.id)
        )
        full_dm = res.scalar_one()

        dm_dict = {
            "id": full_dm.id,
            "conversation_id": full_dm.conversation_id,
            "sender_id": full_dm.sender_id,
            "content": full_dm.content,
            "attachments_json": full_dm.attachments_json,
            "created_at": full_dm.created_at.isoformat(),
            "sender": {
                "id": full_dm.sender.id,
                "username": full_dm.sender.username,
                "avatar_url": full_dm.sender.avatar_url,
                "status": full_dm.sender.status
            }
        }

    await sio.emit("new_dm_message", dm_dict, room=f"dm_{conversation_id}")

    target_sids = user_to_sids.get(target_user_id, set())
    for tsid in target_sids:
        await sio.emit("new_dm_notification", dm_dict, to=tsid)


# --- Watch Together Activity ---

@sio.event
async def watch_set_video(sid, data):
    """Set (or change) the YouTube video for a voice room's watch session."""
    user_data = sid_to_user.get(sid)
    if not user_data:
        return
    channel_id = data.get("channel_id")
    video_id = data.get("video_id", "").strip()
    title = data.get("title", "")
    if not channel_id or not video_id:
        return

    watch_room_state[channel_id] = {
        "video_id": video_id,
        "title": title,
        "is_playing": False,
        "current_time": 0.0,
        "last_updated": datetime.datetime.utcnow().isoformat(),
        "set_by": user_data["username"]
    }

    await sio.emit("watch_sync", {
        "channel_id": channel_id,
        "type": "set_video",
        "video_id": video_id,
        "title": title,
        "is_playing": False,
        "current_time": 0.0,
        "set_by": user_data["username"]
    }, room=f"voice_{channel_id}")


@sio.event
async def watch_play(sid, data):
    """Relay a play event to all users in the voice room."""
    user_data = sid_to_user.get(sid)
    if not user_data:
        return
    channel_id = data.get("channel_id")
    current_time = data.get("current_time", 0.0)
    if not channel_id:
        return

    if channel_id in watch_room_state:
        watch_room_state[channel_id]["is_playing"] = True
        watch_room_state[channel_id]["current_time"] = current_time
        watch_room_state[channel_id]["last_updated"] = datetime.datetime.utcnow().isoformat()

    await sio.emit("watch_sync", {
        "channel_id": channel_id,
        "type": "play",
        "current_time": current_time,
        "by": user_data["username"]
    }, room=f"voice_{channel_id}", skip_sid=sid)


@sio.event
async def watch_pause(sid, data):
    """Relay a pause event to all users in the voice room."""
    user_data = sid_to_user.get(sid)
    if not user_data:
        return
    channel_id = data.get("channel_id")
    current_time = data.get("current_time", 0.0)
    if not channel_id:
        return

    if channel_id in watch_room_state:
        watch_room_state[channel_id]["is_playing"] = False
        watch_room_state[channel_id]["current_time"] = current_time
        watch_room_state[channel_id]["last_updated"] = datetime.datetime.utcnow().isoformat()

    await sio.emit("watch_sync", {
        "channel_id": channel_id,
        "type": "pause",
        "current_time": current_time,
        "by": user_data["username"]
    }, room=f"voice_{channel_id}", skip_sid=sid)


@sio.event
async def watch_seek(sid, data):
    """Relay a seek event to all users in the voice room."""
    user_data = sid_to_user.get(sid)
    if not user_data:
        return
    channel_id = data.get("channel_id")
    current_time = data.get("current_time", 0.0)
    if not channel_id:
        return

    if channel_id in watch_room_state:
        watch_room_state[channel_id]["current_time"] = current_time
        watch_room_state[channel_id]["last_updated"] = datetime.datetime.utcnow().isoformat()

    await sio.emit("watch_sync", {
        "channel_id": channel_id,
        "type": "seek",
        "current_time": current_time,
        "by": user_data["username"]
    }, room=f"voice_{channel_id}", skip_sid=sid)


@sio.event
async def watch_close(sid, data):
    """Close / clear the watch together session for a voice room."""
    user_data = sid_to_user.get(sid)
    if not user_data:
        return
    channel_id = data.get("channel_id")
    if not channel_id:
        return

    if channel_id in watch_room_state:
        del watch_room_state[channel_id]

    await sio.emit("watch_sync", {
        "channel_id": channel_id,
        "type": "close",
        "by": user_data["username"]
    }, room=f"voice_{channel_id}")


@sio.event
async def edit_message(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return

    message_id = data.get("message_id")
    new_content = data.get("content", "").strip()
    channel_id = data.get("channel_id")
    conversation_id = data.get("conversation_id")

    if not message_id or not new_content:
        return

    async with AsyncSessionLocal() as db:
        if channel_id:
            res = await db.execute(select(Message).where(Message.id == message_id, Message.user_id == user_data["id"]))
            msg = res.scalar_one_or_none()
            if msg:
                msg.content = new_content
                await db.commit()
                await sio.emit("message_edited", {"message_id": message_id, "content": new_content}, room=f"channel_{channel_id}")
        elif conversation_id:
            res = await db.execute(select(DirectMessage).where(DirectMessage.id == message_id, DirectMessage.sender_id == user_data["id"]))
            msg = res.scalar_one_or_none()
            if msg:
                msg.content = new_content
                await db.commit()
                await sio.emit("message_edited", {"message_id": message_id, "content": new_content}, room=f"dm_{conversation_id}")

@sio.event
async def delete_message(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return

    message_id = data.get("message_id")
    channel_id = data.get("channel_id")
    conversation_id = data.get("conversation_id")

    if not message_id:
        return

    async with AsyncSessionLocal() as db:
        if channel_id:
            res = await db.execute(select(Message).where(Message.id == message_id, Message.user_id == user_data["id"]))
            msg = res.scalar_one_or_none()
            if msg:
                await db.delete(msg)
                await db.commit()
                await sio.emit("message_deleted", {"message_id": message_id}, room=f"channel_{channel_id}")
        elif conversation_id:
            res = await db.execute(select(DirectMessage).where(DirectMessage.id == message_id, DirectMessage.sender_id == user_data["id"]))
            msg = res.scalar_one_or_none()
            if msg:
                await db.delete(msg)
                await db.commit()
                await sio.emit("message_deleted", {"message_id": message_id}, room=f"dm_{conversation_id}")

@sio.event
async def kick_from_voice(sid, data):
    user_data = sid_to_user.get(sid)
    target_user_id = data.get("target_user_id")
    channel_id = data.get("channel_id")
    
    if not user_data or not target_user_id or not channel_id:
        return

    # In a real app we would check if user_data["id"] has permission (server owner, admin etc)
    # For now, we will simply kick the target from the voice room.
    target_sids = get_target_sids(target_user_id)
    for tsid in target_sids:
        await sio.emit("kicked_from_voice", {"channel_id": channel_id}, to=tsid)

