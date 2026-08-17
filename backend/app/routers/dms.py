from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload
from typing import List, Optional

from app.database import get_db
from app.models import User, DMConversation, DirectMessage
from app.schemas import DMConversationResponse, DirectMessageResponse, UserPublicResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/dms", tags=["Direct Messages"])

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
        other_user = conv.user2 if conv.user1_id == current_user.id else conv.user1
        result.append(DMConversationResponse(
            id=conv.id,
            user1_id=conv.user1_id,
            user2_id=conv.user2_id,
            created_at=conv.created_at,
            other_user=UserPublicResponse.model_validate(other_user)
        ))
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
        res = await db.execute(select(User).where(User.username == target_username))
        target_user = res.scalar_one_or_none()
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
        conv = DMConversation(user1_id=u1, user2_id=u2)
        db.add(conv)
        await db.commit()
        await db.refresh(conv)
        # Re-fetch with relationships
        res = await db.execute(
            select(DMConversation)
            .options(
                selectinload(DMConversation.user1),
                selectinload(DMConversation.user2)
            )
            .where(DMConversation.id == conv.id)
        )
        conv = res.scalar_one()

    other_user = conv.user2 if conv.user1_id == current_user.id else conv.user1
    return DMConversationResponse(
        id=conv.id,
        user1_id=conv.user1_id,
        user2_id=conv.user2_id,
        created_at=conv.created_at,
        other_user=UserPublicResponse.model_validate(other_user)
    )

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

@router.get("/users/search", response_model=List[UserPublicResponse])
async def search_users(
    q: str = Query("", min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(User)
        .where(
            User.username.ilike(f"%{q}%"),
            User.id != current_user.id
        )
        .limit(20)
    )
    users = res.scalars().all()
    return users
