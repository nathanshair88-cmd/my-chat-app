from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Friendship, User, UserBlock

router = APIRouter(prefix="/api/friends", tags=["friends"])


class FriendRequest(BaseModel):
    target: Optional[str] = None
    username: Optional[str] = None
    target_user_id: Optional[int] = None


class FriendResponse(BaseModel):
    id: int
    user_id: int
    friend_id: int
    status: str
    direction: str
    is_seen: bool
    created_at: datetime
    friend_user: Dict


def _user_payload(user: User) -> Dict:
    return {
        "id": user.id,
        "public_id": user.public_id,
        "username": user.username,
        "avatar_url": user.avatar_url,
        "status": user.status,
        "status_message": user.status_message,
        "created_at": user.created_at,
    }


async def _emit_friend_event(user_ids: List[int], event: str = "friendships_updated", payload: Optional[Dict] = None):
    from app.socket_events import sio, user_to_sids

    for user_id in set(user_ids):
        for sid in user_to_sids.get(user_id, set()):
            await sio.emit(event, payload or {}, to=sid)


async def _find_user(db: AsyncSession, req: FriendRequest) -> User:
    if req.target_user_id:
        res = await db.execute(select(User).where(User.id == req.target_user_id))
        user = res.scalar_one_or_none()
        if user:
            return user

    lookup = (req.target or req.username or "").strip()
    if not lookup:
        raise HTTPException(status_code=400, detail="Username or user ID required")

    public_id = lookup[1:] if lookup.startswith("#") else lookup
    res = await db.execute(select(User).where(User.public_id == public_id.upper()))
    user = res.scalar_one_or_none()
    if user:
        return user

    res = await db.execute(select(User).where(User.username == lookup))
    matches = res.scalars().all()
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail="Multiple users have that username. Use their #ID instead.")
    if not matches:
        raise HTTPException(status_code=404, detail="User not found")
    return matches[0]


async def _relationship_between(db: AsyncSession, user_id: int, target_user_id: int) -> Optional[Friendship]:
    res = await db.execute(
        select(Friendship)
        .where(
            or_(
                and_(Friendship.user_id == user_id, Friendship.friend_id == target_user_id),
                and_(Friendship.user_id == target_user_id, Friendship.friend_id == user_id),
            )
        )
        .limit(1)
    )
    return res.scalar_one_or_none()


async def _block_state(db: AsyncSession, user_id: int, target_user_id: int) -> Dict[str, bool]:
    res = await db.execute(
        select(UserBlock)
        .where(
            or_(
                and_(UserBlock.blocker_id == user_id, UserBlock.blocked_id == target_user_id),
                and_(UserBlock.blocker_id == target_user_id, UserBlock.blocked_id == user_id),
            )
        )
    )
    blocks = res.scalars().all()
    return {
        "is_blocked_by_me": any(block.blocker_id == user_id for block in blocks),
        "has_blocked_me": any(block.blocker_id == target_user_id for block in blocks),
    }


async def _relationship_response(db: AsyncSession, friendship: Friendship, current_user_id: int) -> Dict:
    other_user_id = friendship.friend_id if friendship.user_id == current_user_id else friendship.user_id
    res = await db.execute(select(User).where(User.id == other_user_id))
    other_user = res.scalar_one()

    if friendship.status == "accepted":
        direction = "accepted"
    elif friendship.friend_id == current_user_id:
        direction = "incoming"
    else:
        direction = "outgoing"

    return {
        "id": friendship.id,
        "user_id": friendship.user_id,
        "friend_id": friendship.friend_id,
        "status": friendship.status,
        "direction": direction,
        "is_seen": bool(friendship.is_seen),
        "created_at": friendship.created_at,
        "friend_user": _user_payload(other_user),
    }


async def _delete_relationship(db: AsyncSession, friendship: Friendship):
    await db.delete(friendship)
    await db.commit()
    await _emit_friend_event([friendship.user_id, friendship.friend_id])


@router.get("/", response_model=List[FriendResponse])
async def get_friends(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(
        select(Friendship, User)
        .join(
            User,
            or_(
                and_(Friendship.user_id == current_user.id, User.id == Friendship.friend_id),
                and_(Friendship.friend_id == current_user.id, User.id == Friendship.user_id),
            )
        )
        .where(or_(Friendship.user_id == current_user.id, Friendship.friend_id == current_user.id))
        .order_by(Friendship.status.asc(), Friendship.created_at.desc())
    )

    results = []
    for friendship, other_user in res.all():
        if friendship.status == "accepted":
            direction = "accepted"
        elif friendship.friend_id == current_user.id:
            direction = "incoming"
        else:
            direction = "outgoing"

        results.append({
            "id": friendship.id,
            "user_id": friendship.user_id,
            "friend_id": friendship.friend_id,
            "status": friendship.status,
            "direction": direction,
            "is_seen": bool(friendship.is_seen),
            "created_at": friendship.created_at,
            "friend_user": _user_payload(other_user),
        })

    return results


@router.get("/relationship/{target_user_id}")
async def get_relationship(
    target_user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if target_user_id == current_user.id:
        return {"status": "self", "friendship_id": None, "direction": "self"}

    target = await db.get(User, target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    block_state = await _block_state(db, current_user.id, target_user_id)
    if block_state["is_blocked_by_me"] or block_state["has_blocked_me"]:
        return {
            "status": "blocked",
            "friendship_id": None,
            "direction": "blocked",
            **block_state,
        }

    friendship = await _relationship_between(db, current_user.id, target_user_id)
    if not friendship:
        return {
            "status": "none",
            "friendship_id": None,
            "direction": "none",
            **block_state,
        }

    if friendship.status == "accepted":
        direction = "accepted"
    elif friendship.friend_id == current_user.id:
        direction = "incoming"
    else:
        direction = "outgoing"

    return {
        "status": friendship.status,
        "friendship_id": friendship.id,
        "direction": direction,
        "is_seen": bool(friendship.is_seen),
        **block_state,
    }


@router.put("/requests/mark-read")
async def mark_friend_requests_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Friendship).where(
            Friendship.friend_id == current_user.id,
            Friendship.status == "pending",
            Friendship.is_seen == 0,
        )
    )
    requests = res.scalars().all()
    for request in requests:
        request.is_seen = 1

    if requests:
        await db.commit()
        await _emit_friend_event([current_user.id])

    return {"message": "Friend requests marked read", "updated": len(requests)}


@router.post("/request", status_code=status.HTTP_201_CREATED)
async def send_friend_request(
    req: FriendRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    target_user = await _find_user(db, req)

    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot send friend request to yourself")

    block_state = await _block_state(db, current_user.id, target_user.id)
    if block_state["is_blocked_by_me"] or block_state["has_blocked_me"]:
        raise HTTPException(status_code=403, detail="Cannot send friend request to a blocked user")

    existing = await _relationship_between(db, current_user.id, target_user.id)
    if existing:
        if existing.status == "accepted":
            raise HTTPException(status_code=409, detail="Already friends with this user")
        if existing.user_id == current_user.id:
            raise HTTPException(status_code=409, detail="Friend request already sent")
        raise HTTPException(status_code=409, detail="This user already sent you a friend request")

    friendship = Friendship(
        user_id=current_user.id,
        friend_id=target_user.id,
        status="pending",
        is_seen=0,
    )
    db.add(friendship)
    try:
        await db.commit()
        await db.refresh(friendship)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Friend request already exists")

    payload = await _relationship_response(db, friendship, current_user.id)
    await _emit_friend_event([current_user.id, target_user.id])
    await _emit_friend_event(
        [target_user.id],
        "friend_request_received",
        {"friendship_id": friendship.id, "from_user": _user_payload(current_user)},
    )
    return payload


@router.put("/{friendship_id}/accept")
async def accept_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    friendship = await db.get(Friendship, friendship_id)
    if not friendship or friendship.status != "pending":
        raise HTTPException(status_code=404, detail="Friend request not found")

    if friendship.friend_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to accept this request")

    block_state = await _block_state(db, friendship.user_id, friendship.friend_id)
    if block_state["is_blocked_by_me"] or block_state["has_blocked_me"]:
        raise HTTPException(status_code=403, detail="Cannot accept request from a blocked user")

    friendship.status = "accepted"
    friendship.is_seen = 1
    await db.commit()
    await db.refresh(friendship)
    await _emit_friend_event([friendship.user_id, friendship.friend_id])
    return await _relationship_response(db, friendship, current_user.id)


@router.put("/{friendship_id}/decline")
async def decline_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    friendship = await db.get(Friendship, friendship_id)
    if not friendship or friendship.status != "pending":
        raise HTTPException(status_code=404, detail="Friend request not found")

    if friendship.friend_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to decline this request")

    await _delete_relationship(db, friendship)
    return {"message": "Friend request declined"}


@router.delete("/{friendship_id}/cancel")
async def cancel_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    friendship = await db.get(Friendship, friendship_id)
    if not friendship or friendship.status != "pending":
        raise HTTPException(status_code=404, detail="Friend request not found")

    if friendship.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to cancel this request")

    await _delete_relationship(db, friendship)
    return {"message": "Friend request cancelled"}


@router.delete("/{friendship_id}")
async def remove_friend(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    friendship = await db.get(Friendship, friendship_id)
    if not friendship:
        raise HTTPException(status_code=404, detail="Friendship not found")

    if friendship.user_id != current_user.id and friendship.friend_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if friendship.status == "pending":
        message = "Friend request cancelled" if friendship.user_id == current_user.id else "Friend request declined"
    else:
        message = "Friend removed successfully"

    await _delete_relationship(db, friendship)
    return {"message": message}


@router.post("/block")
async def block_user(
    req: FriendRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    target_user = await _find_user(db, req)
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")

    block = UserBlock(blocker_id=current_user.id, blocked_id=target_user.id)
    db.add(block)
    try:
        await db.execute(
            delete(Friendship).where(
                or_(
                    and_(Friendship.user_id == current_user.id, Friendship.friend_id == target_user.id),
                    and_(Friendship.user_id == target_user.id, Friendship.friend_id == current_user.id),
                )
            )
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="User is already blocked")

    await _emit_friend_event([current_user.id, target_user.id])
    return {"message": "User blocked", "blocked_user_id": target_user.id}


@router.delete("/block/{target_user_id}")
async def unblock_user(
    target_user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(UserBlock).where(
            UserBlock.blocker_id == current_user.id,
            UserBlock.blocked_id == target_user_id,
        )
    )
    block = res.scalar_one_or_none()
    if not block:
        raise HTTPException(status_code=404, detail="Block not found")

    await db.delete(block)
    await db.commit()
    await _emit_friend_event([current_user.id, target_user_id])
    return {"message": "User unblocked"}
