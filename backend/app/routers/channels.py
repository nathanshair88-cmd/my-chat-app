from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Message, User
from app.schemas import MessageResponse
from app.auth import get_current_user
from app.permissions import user_channel
from app.socket_events import _message_dict

router = APIRouter(prefix="/api/channels", tags=["channels"])

@router.get("/{channel_id}/messages", response_model=list[MessageResponse])
async def get_channel_messages(
    channel_id: int,
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await user_channel(db, current_user.id, channel_id):
        raise HTTPException(status_code=403, detail="Not authorized for this channel")

    res = await db.execute(
        select(Message)
        .where(Message.channel_id == channel_id, Message.parent_id.is_(None))
        .options(
            selectinload(Message.author),
            selectinload(Message.reactions)
        )
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    messages = res.scalars().all()
    return [_message_dict(m) for m in messages]

@router.get("/{channel_id}/messages/{message_id}/thread", response_model=list[MessageResponse])
async def get_thread_messages(
    channel_id: int,
    message_id: int,
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await user_channel(db, current_user.id, channel_id):
        raise HTTPException(status_code=403, detail="Not authorized for this channel")

    res = await db.execute(
        select(Message)
        .where(Message.channel_id == channel_id, Message.parent_id == message_id)
        .options(
            selectinload(Message.author),
            selectinload(Message.reactions)
        )
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    messages = res.scalars().all()
    return [_message_dict(m) for m in messages]
