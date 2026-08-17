import datetime
import logging
import os
import socketio
import traceback
from typing import Dict, Any, Optional
from sqlalchemy import select, delete, or_
from sqlalchemy.orm import selectinload
from app.database import AsyncSessionLocal
from app.models import User, Message, Reaction, Channel, ServerMember, DMConversation, DirectMessage, Server
from app.auth import decode_token
from app.permissions import can_manage_member, can_signal_user, to_int, user_channel, user_dm_conversation
from app.cors import is_allowed_origin

logger = logging.getLogger("discoalto.socket")

sio = socketio.AsyncServer(
    async_mode='asgi',
    # FastAPI's CORSMiddleware wraps this mounted app and writes the polling CORS
    # headers. Disable Engine.IO's CORS writer so browsers do not receive a
    # duplicated Access-Control-Allow-Origin header.
    cors_allowed_origins=[],
    max_http_buffer_size=10_000_000  # 10 MB limit for file attachments
)

MAX_MESSAGE_LENGTH = 4000
MAX_ATTACHMENTS_JSON_LENGTH = 8_000_000


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _socket_error(message: str, exc: Optional[Exception] = None) -> dict:
    response = {"ok": False, "error": message}
    if exc is not None:
        logger.exception(message)
        if _env_flag("DEBUG_EXCEPTIONS", True):
            response.update({
                "debug": True,
                "exception_type": type(exc).__name__,
                "exception": str(exc),
                "traceback": "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)),
            })
    return response

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


def _clean_content(content: Any, attachments_json: Optional[str] = None) -> str:
    content = str(content or "").strip()
    if not content and attachments_json:
        return "[Attachment]"
    return content[:MAX_MESSAGE_LENGTH]


def _valid_attachments_json(attachments_json: Any) -> Optional[str]:
    if attachments_json is None:
        return None
    attachments_json = str(attachments_json)
    if len(attachments_json) > MAX_ATTACHMENTS_JSON_LENGTH:
        return None
    return attachments_json


def _message_dict(message: Message) -> dict:
    return {
        "id": message.id,
        "channel_id": message.channel_id,
        "user_id": message.user_id,
        "content": message.content,
        "attachments_json": message.attachments_json,
        "parent_id": message.parent_id,
        "webhook_id": message.webhook_id,
        "custom_username": message.custom_username,
        "custom_avatar_url": message.custom_avatar_url,
        "created_at": message.created_at.isoformat(),
        "author": {
            "id": message.author.id,
            "public_id": message.author.public_id,
            "username": message.author.username,
            "avatar_url": message.author.avatar_url,
            "status": message.author.status,
            "status_message": message.author.status_message,
        },
        "reactions": [
            {"id": r.id, "emoji": r.emoji, "user_id": r.user_id}
            for r in (message.reactions or [])
        ],
    }


def _dm_dict(message: DirectMessage) -> dict:
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "content": message.content,
        "attachments_json": message.attachments_json,
        "is_read": bool(message.is_read),
        "created_at": message.created_at.isoformat(),
        "sender": {
            "id": message.sender.id,
            "public_id": message.sender.public_id,
            "username": message.sender.username,
            "avatar_url": message.sender.avatar_url,
            "status": message.sender.status,
            "status_message": message.sender.status_message,
        },
    }


async def _server_room_for_channel(db, channel_id) -> Optional[str]:
    channel_id = to_int(channel_id)
    if channel_id is None:
        return None
    res = await db.execute(select(Channel.server_id).where(Channel.id == channel_id))
    server_id = res.scalar_one_or_none()
    return f"server_{server_id}" if server_id is not None else None


async def _emit_voice_room_update(channel_id, users, started_at=None):
    if started_at is None:
        started_at = voice_room_started_at.get(channel_id)
    async with AsyncSessionLocal() as db:
        server_room = await _server_room_for_channel(db, channel_id)
    if not server_room:
        return
    await sio.emit(
        "voice_room_update",
        {
            "channel_id": channel_id,
            "users": users,
            "started_at": started_at,
        },
        room=server_room,
    )


async def _user_in_voice_room(user_id: int, channel_id) -> bool:
    channel_id = to_int(channel_id)
    if channel_id is None:
        return False
    if user_id not in voice_room_users.get(channel_id, {}):
        return False
    async with AsyncSessionLocal() as db:
        return await user_channel(db, user_id, channel_id, allowed_types={"voice", "media"}) is not None

@sio.event
async def connect(sid, environ, auth=None):
    if not is_allowed_origin(environ.get("HTTP_ORIGIN"), "CORS_ORIGINS", "SOCKET_CORS_ORIGINS"):
        return False

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
    server_ids = []
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.id == user_id))
        user = res.scalar_one_or_none()
        if not user:
            return False

        server_res = await db.execute(
            select(ServerMember.server_id).where(ServerMember.user_id == user_id)
        )
        server_ids = [row[0] for row in server_res.all()]

        user_data = {
            "id": user.id,
            "public_id": user.public_id,
            "username": user.username,
            "avatar_url": user.avatar_url,
            "status": user.status,
            "status_message": user.status_message,
            "server_ids": server_ids,
        }

    sid_to_user[sid] = user_data
    if user_id not in user_to_sids:
        user_to_sids[user_id] = set()
    user_to_sids[user_id].add(sid)

    for server_id in server_ids:
        await sio.enter_room(sid, f"server_{server_id}")

    presence_data = {
        "id": user_data["id"],
        "public_id": user_data["public_id"],
        "username": user_data["username"],
        "avatar_url": user_data["avatar_url"],
        "status": user_data["status"],
        "status_message": user_data["status_message"],
    }
    for server_id in server_ids:
        await sio.emit("user_connected", presence_data, room=f"server_{server_id}")

    # Send existing voice rooms state to connecting user
    async with AsyncSessionLocal() as db:
        for ch_id, users_dict in voice_room_users.items():
            if users_dict and await user_channel(db, user_id, ch_id, allowed_types={"voice", "media"}):
                await sio.emit("voice_room_update", {
                    "channel_id": ch_id,
                    "users": list(users_dict.values()),
                    "started_at": voice_room_started_at.get(ch_id)
                }, to=sid)

        # Send any active watch together session state to connecting user
        for ch_id, watch_state in watch_room_state.items():
            if watch_state.get("video_id") and await user_channel(db, user_id, ch_id, allowed_types={"voice", "media"}):
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
                for server_id in user_data.get("server_ids", []):
                    await sio.emit("user_disconnected", {"user_id": user_id}, room=f"server_{server_id}")

        # Remove from voice rooms if connected
        for ch_id, users in list(voice_room_users.items()):
            if user_id in users:
                del users[user_id]
                started_at = voice_room_started_at.get(ch_id)
                if not users:
                    if ch_id in voice_room_started_at:
                        del voice_room_started_at[ch_id]
                    started_at = None

                await _emit_voice_room_update(ch_id, list(users.values()), started_at)

@sio.event
async def join_channel(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = to_int(data.get("channel_id"))
    if not user_data or channel_id is None:
        return
    async with AsyncSessionLocal() as db:
        if not await user_channel(db, user_data["id"], channel_id):
            return
    await sio.enter_room(sid, f"channel_{channel_id}")

@sio.event
async def leave_channel(sid, data):
    channel_id = to_int(data.get("channel_id"))
    if channel_id is not None:
        await sio.leave_room(sid, f"channel_{channel_id}")

@sio.event
async def send_message(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return _socket_error("Not authenticated")

    try:
        if not isinstance(data, dict):
            return _socket_error("Invalid message payload")

        channel_id = to_int(data.get("channel_id"))
        attachments_json = _valid_attachments_json(data.get("attachments_json"))
        content = _clean_content(data.get("content"), attachments_json)
        parent_id = to_int(data.get("parent_id"))

        if channel_id is None or not content:
            return _socket_error("Missing channel or message content")

        async with AsyncSessionLocal() as db:
            try:
                if not await user_channel(db, user_data["id"], channel_id):
                    return _socket_error("You do not have access to this channel")

                if parent_id is not None:
                    parent_res = await db.execute(
                        select(Message.id).where(Message.id == parent_id, Message.channel_id == channel_id)
                    )
                    if parent_res.scalar_one_or_none() is None:
                        return _socket_error("Reply target no longer exists")

                new_msg = Message(
                    channel_id=channel_id,
                    user_id=user_data["id"],
                    content=content,
                    attachments_json=attachments_json,
                    parent_id=parent_id
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

                msg_dict = _message_dict(full_msg)
            except Exception:
                await db.rollback()
                raise

        await sio.enter_room(sid, f"channel_{channel_id}")
        await sio.emit("new_message", msg_dict, room=f"channel_{channel_id}")
        return {"ok": True, "message": msg_dict}
    except Exception as exc:
        return _socket_error("Message failed to send", exc)

@sio.event
async def add_reaction(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return

    message_id = to_int(data.get("message_id"))
    emoji = data.get("emoji")
    emoji = str(emoji or "")[:50]

    if not message_id or not emoji:
        return

    async with AsyncSessionLocal() as db:
        msg_res = await db.execute(select(Message).where(Message.id == message_id))
        msg = msg_res.scalar_one_or_none()
        if not msg or not await user_channel(db, user_data["id"], msg.channel_id):
            return

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
    }, room=f"channel_{msg.channel_id}")

@sio.event
async def remove_reaction(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return

    message_id = to_int(data.get("message_id"))
    emoji = data.get("emoji")
    emoji = str(emoji or "")[:50]

    if not message_id or not emoji:
        return

    async with AsyncSessionLocal() as db:
        msg_res = await db.execute(select(Message).where(Message.id == message_id))
        msg = msg_res.scalar_one_or_none()
        if not msg or not await user_channel(db, user_data["id"], msg.channel_id):
            return

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
    }, room=f"channel_{msg.channel_id}")

@sio.event
async def typing_start(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = to_int(data.get("channel_id"))
    if user_data and channel_id:
        async with AsyncSessionLocal() as db:
            if not await user_channel(db, user_data["id"], channel_id):
                return
        await sio.emit("user_typing", {
            "user_id": user_data["id"],
            "username": user_data["username"],
            "channel_id": channel_id,
            "is_typing": True
        }, room=f"channel_{channel_id}", skip_sid=sid)

@sio.event
async def typing_stop(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = to_int(data.get("channel_id"))
    if user_data and channel_id:
        async with AsyncSessionLocal() as db:
            if not await user_channel(db, user_data["id"], channel_id):
                return
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

    channel_id = to_int(data.get("channel_id"))
    if channel_id is None:
        return

    async with AsyncSessionLocal() as db:
        if not await user_channel(db, user_data["id"], channel_id, allowed_types={"voice", "media"}):
            return

    await sio.enter_room(sid, f"voice_{channel_id}")

    if channel_id not in voice_room_users or len(voice_room_users[channel_id]) == 0:
        voice_room_users[channel_id] = {}
        voice_room_started_at[channel_id] = datetime.datetime.utcnow().isoformat()

    user_info = {
        "id": user_data["id"],
        "public_id": user_data["public_id"],
        "username": user_data["username"],
        "avatar_url": user_data["avatar_url"],
        "is_screen_sharing": False,
        "is_camera_on": False,
    }
    voice_room_users[channel_id][user_data["id"]] = user_info

    await _emit_voice_room_update(
        channel_id,
        list(voice_room_users[channel_id].values()),
        voice_room_started_at.get(channel_id),
    )

@sio.event
async def leave_voice(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = to_int(data.get("channel_id"))
    if user_data and channel_id:
        room_name = f"voice_{channel_id}"
        await sio.leave_room(sid, room_name)
        if channel_id in voice_room_users and user_data["id"] in voice_room_users[channel_id]:
            del voice_room_users[channel_id][user_data["id"]]
            if len(voice_room_users[channel_id]) == 0:
                if channel_id in voice_room_started_at:
                    del voice_room_started_at[channel_id]
            started_at = voice_room_started_at.get(channel_id)
            await _emit_voice_room_update(
                channel_id,
                list(voice_room_users[channel_id].values()),
                started_at,
            )

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
    target_user_id = to_int(data.get("target_user_id"))
    channel_id = to_int(data.get("channel_id"))
    user_data = sid_to_user.get(sid)
    if target_user_id and user_data and channel_id:
        users = voice_room_users.get(channel_id, {})
        if user_data["id"] not in users or target_user_id not in users:
            return
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("voice_offer", {
                "sender_id": user_data["id"],
                "sender_username": user_data["username"],
                "offer": data.get("offer"),
                "channel_id": channel_id
            }, to=tsid)

@sio.event
async def voice_answer(sid, data):
    target_user_id = to_int(data.get("target_user_id"))
    channel_id = to_int(data.get("channel_id"))
    user_data = sid_to_user.get(sid)
    if target_user_id and user_data and channel_id:
        users = voice_room_users.get(channel_id, {})
        if user_data["id"] not in users or target_user_id not in users:
            return
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("voice_answer", {
                "sender_id": user_data["id"],
                "answer": data.get("answer"),
                "channel_id": channel_id
            }, to=tsid)

@sio.event
async def voice_ice_candidate(sid, data):
    target_user_id = to_int(data.get("target_user_id"))
    channel_id = to_int(data.get("channel_id"))
    user_data = sid_to_user.get(sid)
    if target_user_id and user_data and channel_id:
        users = voice_room_users.get(channel_id, {})
        if user_data["id"] not in users or target_user_id not in users:
            return
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("voice_ice_candidate", {
                "sender_id": user_data["id"],
                "candidate": data.get("candidate"),
                "channel_id": channel_id
            }, to=tsid)

@sio.event
async def toggle_screen_share(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = to_int(data.get("channel_id"))
    is_sharing = data.get("is_sharing", False)
    if user_data and channel_id in voice_room_users:
        if user_data["id"] in voice_room_users[channel_id]:
            voice_room_users[channel_id][user_data["id"]]["is_screen_sharing"] = is_sharing
            await _emit_voice_room_update(channel_id, list(voice_room_users[channel_id].values()))

@sio.event
async def toggle_camera(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = to_int(data.get("channel_id"))
    is_on = data.get("is_on", False)
    if user_data and channel_id in voice_room_users:
        if user_data["id"] in voice_room_users[channel_id]:
            voice_room_users[channel_id][user_data["id"]]["is_camera_on"] = bool(is_on)
            await _emit_voice_room_update(channel_id, list(voice_room_users[channel_id].values()))

@sio.event
async def voice_audio_chunk(sid, data):
    user_data = sid_to_user.get(sid)
    channel_id = to_int(data.get("channel_id"))
    chunk = data.get("chunk")
    if user_data and channel_id and chunk:
        if user_data["id"] not in voice_room_users.get(channel_id, {}):
            return
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
    target_user_id = to_int(data.get("target_user_id"))
    if user_data and target_user_id:
        async with AsyncSessionLocal() as db:
            if not await can_signal_user(db, user_data["id"], target_user_id):
                return
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("p2p_file_offer", {
                "sender": {
                    "id": user_data["id"],
                    "public_id": user_data["public_id"],
                    "username": user_data["username"],
                    "avatar_url": user_data["avatar_url"],
                    "status": user_data["status"],
                    "status_message": user_data["status_message"],
                },
                "transfer_id": data.get("transfer_id"),
                "file_name": str(data.get("file_name") or "file")[:255],
                "file_size": data.get("file_size"),
                "file_type": str(data.get("file_type") or "application/octet-stream")[:100],
                "offer": data.get("offer")
            }, to=tsid)

@sio.event
async def p2p_file_answer(sid, data):
    user_data = sid_to_user.get(sid)
    target_user_id = to_int(data.get("target_user_id"))
    if user_data and target_user_id:
        async with AsyncSessionLocal() as db:
            if not await can_signal_user(db, user_data["id"], target_user_id):
                return
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
    target_user_id = to_int(data.get("target_user_id"))
    if user_data and target_user_id:
        async with AsyncSessionLocal() as db:
            if not await can_signal_user(db, user_data["id"], target_user_id):
                return
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
    target_user_id = to_int(data.get("target_user_id"))
    if user_data and target_user_id:
        async with AsyncSessionLocal() as db:
            if not await can_signal_user(db, user_data["id"], target_user_id):
                return
        target_sids = get_target_sids(target_user_id)
        for tsid in target_sids:
            await sio.emit("p2p_file_cancel", {
                "transfer_id": data.get("transfer_id")
            }, to=tsid)


# --- Direct Messaging Socket Events ---

@sio.event
async def join_dm(sid, data):
    user_data = sid_to_user.get(sid)
    conversation_id = to_int(data.get("conversation_id"))
    if not user_data or conversation_id is None:
        return
    async with AsyncSessionLocal() as db:
        if not await user_dm_conversation(db, user_data["id"], conversation_id):
            return
    await sio.enter_room(sid, f"dm_{conversation_id}")

@sio.event
async def leave_dm(sid, data):
    conversation_id = to_int(data.get("conversation_id"))
    if conversation_id is not None:
        await sio.leave_room(sid, f"dm_{conversation_id}")

@sio.event
async def send_dm_message(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return _socket_error("Not authenticated")

    try:
        if not isinstance(data, dict):
            return _socket_error("Invalid message payload")

        conversation_id = to_int(data.get("conversation_id"))
        attachments_json = _valid_attachments_json(data.get("attachments_json"))
        content = _clean_content(data.get("content"), attachments_json)

        if conversation_id is None or not content:
            return _socket_error("Missing conversation or message content")

        async with AsyncSessionLocal() as db:
            try:
                conv = await user_dm_conversation(db, user_data["id"], conversation_id)
                if not conv:
                    return _socket_error("You do not have access to this conversation")

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

                dm_dict = _dm_dict(full_dm)
            except Exception:
                await db.rollback()
                raise

        await sio.enter_room(sid, f"dm_{conversation_id}")
        await sio.emit("new_dm_message", dm_dict, room=f"dm_{conversation_id}")

        target_sids = user_to_sids.get(target_user_id, set())
        for tsid in target_sids:
            await sio.emit("new_dm_notification", dm_dict, to=tsid)

        return {"ok": True, "message": dm_dict}
    except Exception as exc:
        return _socket_error("Direct message failed to send", exc)

@sio.event
async def mark_dms_read(sid, data):
    user_data = sid_to_user.get(sid)
    if not user_data:
        return

    conversation_id = to_int(data.get("conversation_id"))
    if not conversation_id:
        return

    async with AsyncSessionLocal() as db:
        conv = await user_dm_conversation(db, user_data["id"], conversation_id)
        if not conv:
            return

        res = await db.execute(
            select(DirectMessage).where(
                DirectMessage.conversation_id == conversation_id,
                DirectMessage.sender_id != user_data["id"],
                DirectMessage.is_read == 0
            )
        )
        unread_msgs = res.scalars().all()
        
        if not unread_msgs:
            return

        for msg in unread_msgs:
            msg.is_read = 1
        
        await db.commit()
        
        # Who was the sender of these messages?
        # We need to notify them that their messages were read.
        sender_id = unread_msgs[0].sender_id
        
        target_sids = user_to_sids.get(sender_id, set())
        for tsid in target_sids:
            await sio.emit("dms_read_receipt", {
                "conversation_id": conversation_id,
                "read_by": user_data["id"]
            }, to=tsid)


# --- Watch Together Activity ---

@sio.event
async def watch_set_video(sid, data):
    """Set (or change) the YouTube video for a voice room's watch session."""
    user_data = sid_to_user.get(sid)
    if not user_data:
        return
    channel_id = to_int(data.get("channel_id"))
    video_id = data.get("video_id", "").strip()
    title = str(data.get("title", ""))[:200]
    if not channel_id or not video_id:
        return
    if not await _user_in_voice_room(user_data["id"], channel_id):
        return

    # If it's a new room, initialize the queue. If it's an existing room, setting a video
    # directly just plays it immediately and clears the queue (or keeps it, let's keep it).
    if channel_id not in watch_room_state:
        watch_room_state[channel_id] = {
            "video_id": video_id,
            "title": title,
            "is_playing": False,
            "current_time": 0.0,
            "last_updated": datetime.datetime.utcnow().isoformat(),
            "set_by": user_data["username"],
            "queue": []
        }
    else:
        watch_room_state[channel_id].update({
            "video_id": video_id,
            "title": title,
            "is_playing": False,
            "current_time": 0.0,
            "last_updated": datetime.datetime.utcnow().isoformat(),
            "set_by": user_data["username"]
        })

    await sio.emit("watch_sync", {
        "channel_id": channel_id,
        "type": "set_video",
        "video_id": video_id,
        "title": title,
        "is_playing": False,
        "current_time": 0.0,
        "set_by": user_data["username"],
        "queue": watch_room_state[channel_id]["queue"]
    }, room=f"voice_{channel_id}")


@sio.event
async def watch_enqueue(sid, data):
    """Add a video to the queue."""
    user_data = sid_to_user.get(sid)
    if not user_data:
        return
    channel_id = to_int(data.get("channel_id"))
    video_id = data.get("video_id", "").strip()
    title = str(data.get("title", ""))[:200]
    if not channel_id or not video_id:
        return
    if not await _user_in_voice_room(user_data["id"], channel_id):
        return

    if channel_id in watch_room_state:
        watch_room_state[channel_id].setdefault("queue", []).append({
            "video_id": video_id,
            "title": title,
            "added_by": user_data["username"]
        })

        await sio.emit("watch_sync", {
            "channel_id": channel_id,
            "type": "queue_update",
            "queue": watch_room_state[channel_id]["queue"]
        }, room=f"voice_{channel_id}")


@sio.event
async def watch_dequeue(sid, data):
    """Remove a video from the queue by index."""
    user_data = sid_to_user.get(sid)
    if not user_data:
        return
    channel_id = to_int(data.get("channel_id"))
    index = to_int(data.get("index"))
    if not channel_id or index is None:
        return
    if not await _user_in_voice_room(user_data["id"], channel_id):
        return

    if channel_id in watch_room_state and "queue" in watch_room_state[channel_id]:
        queue = watch_room_state[channel_id]["queue"]
        if 0 <= index < len(queue):
            queue.pop(index)
            await sio.emit("watch_sync", {
                "channel_id": channel_id,
                "type": "queue_update",
                "queue": queue
            }, room=f"voice_{channel_id}")


@sio.event
async def watch_play_next(sid, data):
    """Pop the next video from the queue and play it."""
    user_data = sid_to_user.get(sid)
    if not user_data:
        return
    channel_id = to_int(data.get("channel_id"))
    if not channel_id:
        return
    if not await _user_in_voice_room(user_data["id"], channel_id):
        return

    if channel_id in watch_room_state:
        queue = watch_room_state[channel_id].get("queue", [])
        if queue:
            next_video = queue.pop(0)
            watch_room_state[channel_id].update({
                "video_id": next_video["video_id"],
                "title": next_video["title"],
                "is_playing": True,
                "current_time": 0.0,
                "last_updated": datetime.datetime.utcnow().isoformat(),
                "set_by": next_video["added_by"]
            })

            await sio.emit("watch_sync", {
                "channel_id": channel_id,
                "type": "set_video",
                "video_id": next_video["video_id"],
                "title": next_video["title"],
                "is_playing": True,
                "current_time": 0.0,
                "set_by": next_video["added_by"],
                "queue": queue
            }, room=f"voice_{channel_id}")


@sio.event
async def watch_play(sid, data):
    """Relay a play event to all users in the voice room."""
    user_data = sid_to_user.get(sid)
    if not user_data:
        return
    channel_id = to_int(data.get("channel_id"))
    current_time = data.get("current_time", 0.0)
    if not channel_id:
        return
    if not await _user_in_voice_room(user_data["id"], channel_id):
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
    channel_id = to_int(data.get("channel_id"))
    current_time = data.get("current_time", 0.0)
    if not channel_id:
        return
    if not await _user_in_voice_room(user_data["id"], channel_id):
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
    channel_id = to_int(data.get("channel_id"))
    current_time = data.get("current_time", 0.0)
    if not channel_id:
        return
    if not await _user_in_voice_room(user_data["id"], channel_id):
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
    channel_id = to_int(data.get("channel_id"))
    if not channel_id:
        return
    if not await _user_in_voice_room(user_data["id"], channel_id):
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

    message_id = to_int(data.get("message_id"))
    new_content = _clean_content(data.get("content"))
    channel_id = to_int(data.get("channel_id"))
    conversation_id = to_int(data.get("conversation_id"))

    if not message_id or not new_content:
        return

    async with AsyncSessionLocal() as db:
        if channel_id:
            if not await user_channel(db, user_data["id"], channel_id):
                return
            res = await db.execute(
                select(Message).where(
                    Message.id == message_id,
                    Message.user_id == user_data["id"],
                    Message.channel_id == channel_id,
                )
            )
            msg = res.scalar_one_or_none()
            if msg:
                msg.content = new_content
                msg.updated_at = datetime.datetime.utcnow()
                await db.commit()
                await sio.emit("message_edited", {"message_id": message_id, "content": new_content}, room=f"channel_{channel_id}")
        elif conversation_id:
            if not await user_dm_conversation(db, user_data["id"], conversation_id):
                return
            res = await db.execute(
                select(DirectMessage).where(
                    DirectMessage.id == message_id,
                    DirectMessage.sender_id == user_data["id"],
                    DirectMessage.conversation_id == conversation_id,
                )
            )
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

    message_id = to_int(data.get("message_id"))
    channel_id = to_int(data.get("channel_id"))
    conversation_id = to_int(data.get("conversation_id"))

    if not message_id:
        return

    async with AsyncSessionLocal() as db:
        if channel_id:
            if not await user_channel(db, user_data["id"], channel_id):
                return
            res = await db.execute(
                select(Message).where(
                    Message.id == message_id,
                    Message.user_id == user_data["id"],
                    Message.channel_id == channel_id,
                )
            )
            msg = res.scalar_one_or_none()
            if msg:
                await db.delete(msg)
                await db.commit()
                await sio.emit("message_deleted", {"message_id": message_id}, room=f"channel_{channel_id}")
        elif conversation_id:
            if not await user_dm_conversation(db, user_data["id"], conversation_id):
                return
            res = await db.execute(
                select(DirectMessage).where(
                    DirectMessage.id == message_id,
                    DirectMessage.sender_id == user_data["id"],
                    DirectMessage.conversation_id == conversation_id,
                )
            )
            msg = res.scalar_one_or_none()
            if msg:
                await db.delete(msg)
                await db.commit()
                await sio.emit("message_deleted", {"message_id": message_id}, room=f"dm_{conversation_id}")

@sio.event
async def kick_from_voice(sid, data):
    user_data = sid_to_user.get(sid)
    target_user_id = to_int(data.get("target_user_id"))
    channel_id = to_int(data.get("channel_id"))
    
    if not user_data or not target_user_id or not channel_id:
        return

    async with AsyncSessionLocal() as db:
        channel = await user_channel(db, user_data["id"], channel_id, allowed_types={"voice", "media"})
        if not channel:
            return
        res = await db.execute(select(Server).where(Server.id == channel.server_id))
        server = res.scalar_one_or_none()
        if not server:
            return

        res = await db.execute(
            select(ServerMember).where(
                ServerMember.server_id == server.id,
                ServerMember.user_id == target_user_id,
            )
        )
        target_member = res.scalar_one_or_none()
        if not target_member or not await can_manage_member(db, user_data["id"], target_member, server):
            return

    if target_user_id not in voice_room_users.get(channel_id, {}):
        return

    target_sids = get_target_sids(target_user_id)
    for tsid in target_sids:
        await sio.emit("kicked_from_voice", {"channel_id": channel_id}, to=tsid)
