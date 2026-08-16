from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Message, User
from app.schemas import MessageResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/channels", tags=["channels"])

@router.get("/{channel_id}/messages", response_model=list[MessageResponse])
async def get_channel_messages(
    channel_id: int,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Message)
        .where(Message.channel_id == channel_id)
        .options(
            selectinload(Message.author),
            selectinload(Message.reactions)
        )
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    messages = res.scalars().all()
    return [MessageResponse.model_validate(m) for m in messages]
