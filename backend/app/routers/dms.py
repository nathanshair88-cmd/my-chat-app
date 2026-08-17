from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.database import get_db
from app.models import User, DMConversation, DirectMessage
from app.schemas import DMConversationResponse, DirectMessageResponse, UserPublicResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/dms", tags=["Direct Messages"])


def _conversation_response(conv: DMConversation, current_user_id: int) -> DMConversationResponse:
    other_user = conv.user2 if conv.user1_id == current_user_id else conv.user1
    return DMConversationResponse(
        id=conv.id,
        user1_id=conv.user1_id,
        user2_id=conv.user2_id,
        created_at=conv.created_at,
        other_user=UserPublicResponse.model_validate(other_user)
    )


async def _load_conversation(db: AsyncSession, conversation_id: int) -> DMConversation:
    res = await db.execute(
        select(DMConversation)
        .options(
            selectinload(DMConversation.user1),
            selectinload(DMConversation.user2)
        )
        .where(DMConversation.id == conversation_id)
    )
    return res.scalar_one()


@router.get("/users/search", response_model=List[UserPublicResponse])
async def search_users(
    q: str = Query("", min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    term = q.strip()
    if not term:
        return []

    public_term = term[1:] if term.startswith("#") else term
    res = await db.execute(
        select(User)
        .where(
            or_(
                User.username.ilike(f"%{term}%"),
                User.public_id.ilike(f"%{public_term}%")
            ),
            User.id != current_user.id
        )
        .order_by(User.username.asc(), User.public_id.asc())
        .limit(20)
    )
    users = res.scalars().all()
    return users

@router.get("", response_model=List[DMConversationResponse])
async def get_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(DMConversation)
        .options(
            selectinload(DMConversation.user1),
            selectinload(DMConversation.user2)
        )
        .where(
            or_(
                DMConversation.user1_id == current_user.id,
                DMConversation.user2_id == current_user.id
            )
        )
        .order_by(DMConversation.created_at.desc())
    )
    conversations = res.scalars().all()

    result = []
    for conv in conversations:
        result.append(_conversation_response(conv, current_user.id))
    return result

@router.post("/start", response_model=DMConversationResponse)
async def start_conversation(
    target_username: Optional[str] = None,
    target_user_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not target_username and not target_user_id:
        raise HTTPException(status_code=400, detail="Target username or user_id required")

    if target_username:
        lookup = target_username.strip()
        public_id = lookup[1:] if lookup.startswith("#") else lookup
        res = await db.execute(select(User).where(User.public_id == public_id.upper()))
        target_user = res.scalar_one_or_none()
        if not target_user:
            res = await db.execute(select(User).where(User.username == lookup))
            matches = res.scalars().all()
            if len(matches) > 1:
                raise HTTPException(status_code=409, detail="Multiple users have that username. Use their #ID instead.")
            target_user = matches[0] if matches else None
    else:
        res = await db.execute(select(User).where(User.id == target_user_id))
        target_user = res.scalar_one_or_none()

    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot start DM with yourself")

    # Ensure consistent user1_id < user2_id ordering for uniqueness
    u1, u2 = min(current_user.id, target_user.id), max(current_user.id, target_user.id)

    res = await db.execute(
        select(DMConversation)
        .options(
            selectinload(DMConversation.user1),
            selectinload(DMConversation.user2)
        )
        .where(
            and_(
                DMConversation.user1_id == u1,
                DMConversation.user2_id == u2
            )
        )
    )
    conv = res.scalar_one_or_none()

    if not conv:
        try:
            conv = DMConversation(user1_id=u1, user2_id=u2)
            db.add(conv)
            await db.commit()
            await db.refresh(conv)
        except IntegrityError:
            await db.rollback()
            res = await db.execute(
                select(DMConversation)
                .where(
                    and_(
                        DMConversation.user1_id == u1,
                        DMConversation.user2_id == u2
                    )
                )
            )
            conv = res.scalar_one_or_none()
            if not conv:
                raise HTTPException(status_code=500, detail="Could not start DM")

        conv = await _load_conversation(db, conv.id)

    return _conversation_response(conv, current_user.id)

@router.get("/{conversation_id}/messages", response_model=List[DirectMessageResponse])
async def get_dm_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify user is in conversation
    res = await db.execute(
        select(DMConversation).where(
            DMConversation.id == conversation_id,
            or_(
                DMConversation.user1_id == current_user.id,
                DMConversation.user2_id == current_user.id
            )
        )
    )
    conv = res.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="DM Conversation not found or access denied")

    res = await db.execute(
        select(DirectMessage)
        .options(selectinload(DirectMessage.sender))
        .where(DirectMessage.conversation_id == conversation_id)
        .order_by(DirectMessage.created_at.asc())
    )
    messages = res.scalars().all()
    return messages
