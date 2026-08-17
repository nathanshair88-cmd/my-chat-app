from typing import Optional

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Channel, DMConversation, Friendship, Server, ServerMember

ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_MEMBER = "member"
VALID_SERVER_ROLES = {ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER}


def to_int(value) -> Optional[int]:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


async def get_channel(db: AsyncSession, channel_id) -> Optional[Channel]:
    channel_id = to_int(channel_id)
    if channel_id is None:
        return None
    res = await db.execute(select(Channel).where(Channel.id == channel_id))
    return res.scalar_one_or_none()


async def is_server_member(db: AsyncSession, user_id: int, server_id: int) -> bool:
    res = await db.execute(
        select(ServerMember.id)
        .where(ServerMember.server_id == server_id, ServerMember.user_id == user_id)
        .limit(1)
    )
    return res.scalar_one_or_none() is not None


async def get_server_member(db: AsyncSession, user_id: int, server_id: int) -> Optional[ServerMember]:
    res = await db.execute(
        select(ServerMember)
        .where(ServerMember.server_id == server_id, ServerMember.user_id == user_id)
        .limit(1)
    )
    return res.scalar_one_or_none()


async def is_server_owner(db: AsyncSession, user_id: int, server_id: int) -> bool:
    res = await db.execute(
        select(Server.id)
        .where(Server.id == server_id, Server.owner_id == user_id)
        .limit(1)
    )
    return res.scalar_one_or_none() is not None


async def get_member_role(db: AsyncSession, user_id: int, server_id: int) -> Optional[str]:
    if await is_server_owner(db, user_id, server_id):
        return ROLE_OWNER
    member = await get_server_member(db, user_id, server_id)
    if not member:
        return None
    return member.role if member.role in VALID_SERVER_ROLES else ROLE_MEMBER


async def can_manage_server(db: AsyncSession, user_id: int, server_id: int) -> bool:
    role = await get_member_role(db, user_id, server_id)
    return role in {ROLE_OWNER, ROLE_ADMIN}


async def can_manage_member(db: AsyncSession, actor_id: int, target_member: ServerMember, server: Server) -> bool:
    actor_role = await get_member_role(db, actor_id, server.id)
    target_role = ROLE_OWNER if target_member.user_id == server.owner_id else (
        target_member.role if target_member.role in VALID_SERVER_ROLES else ROLE_MEMBER
    )

    if actor_role == ROLE_OWNER:
        return target_role != ROLE_OWNER
    if actor_role == ROLE_ADMIN:
        return target_role == ROLE_MEMBER
    return False


async def user_channel(db: AsyncSession, user_id: int, channel_id, allowed_types=None) -> Optional[Channel]:
    channel = await get_channel(db, channel_id)
    if not channel:
        return None
    if allowed_types is not None and channel.type not in allowed_types:
        return None
    if not await is_server_member(db, user_id, channel.server_id):
        return None
    return channel


async def user_dm_conversation(db: AsyncSession, user_id: int, conversation_id) -> Optional[DMConversation]:
    conversation_id = to_int(conversation_id)
    if conversation_id is None:
        return None
    res = await db.execute(
        select(DMConversation).where(
            DMConversation.id == conversation_id,
            or_(DMConversation.user1_id == user_id, DMConversation.user2_id == user_id),
        )
    )
    return res.scalar_one_or_none()


async def users_share_server(db: AsyncSession, user_id: int, target_user_id: int) -> bool:
    res = await db.execute(
        select(ServerMember.server_id)
        .where(ServerMember.user_id == user_id)
    )
    server_ids = [row[0] for row in res.all()]
    if not server_ids:
        return False

    res = await db.execute(
        select(ServerMember.id)
        .where(ServerMember.user_id == target_user_id, ServerMember.server_id.in_(server_ids))
        .limit(1)
    )
    return res.scalar_one_or_none() is not None


async def users_are_friends(db: AsyncSession, user_id: int, target_user_id: int) -> bool:
    res = await db.execute(
        select(Friendship.id)
        .where(
            Friendship.status == "accepted",
            or_(
                and_(Friendship.user_id == user_id, Friendship.friend_id == target_user_id),
                and_(Friendship.user_id == target_user_id, Friendship.friend_id == user_id),
            ),
        )
        .limit(1)
    )
    return res.scalar_one_or_none() is not None


async def can_signal_user(db: AsyncSession, user_id: int, target_user_id) -> bool:
    target_user_id = to_int(target_user_id)
    if target_user_id is None or target_user_id == user_id:
        return False
    return (
        await users_share_server(db, user_id, target_user_id)
        or await users_are_friends(db, user_id, target_user_id)
    )
