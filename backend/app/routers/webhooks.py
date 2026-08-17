import secrets
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.database import get_db
from app.models import Server, User, Webhook, Message, Channel
from app.auth import get_current_user
from app.permissions import can_manage_server

router = APIRouter(tags=["webhooks"])

class WebhookCreate(BaseModel):
    name: str
    channel_id: int

class WebhookResponse(BaseModel):
    id: int
    server_id: int
    channel_id: int
    name: str
    token: str
    created_at: datetime

    class Config:
        from_attributes = True

class WebhookExecute(BaseModel):
    content: str
    username: Optional[str] = None
    avatar_url: Optional[str] = None


async def _ensure_can_manage_server(server_id: int, user_id: int, db: AsyncSession):
    res = await db.execute(select(Server.id).where(Server.id == server_id))
    if res.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Server not found")
    if not await can_manage_server(db, user_id, server_id):
        raise HTTPException(status_code=403, detail="Not authorized")

@router.get("/api/servers/{server_id}/webhooks", response_model=List[WebhookResponse])
async def get_webhooks(server_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _ensure_can_manage_server(server_id, current_user.id, db)

    res = await db.execute(select(Webhook).where(Webhook.server_id == server_id))
    return res.scalars().all()

@router.post("/api/servers/{server_id}/webhooks", response_model=WebhookResponse)
async def create_webhook(server_id: int, webhook: WebhookCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _ensure_can_manage_server(server_id, current_user.id, db)

    name = webhook.name.strip()[:100]
    if not name:
        raise HTTPException(status_code=400, detail="Webhook name cannot be empty")

    res = await db.execute(select(Channel).where(Channel.id == webhook.channel_id, Channel.server_id == server_id))
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Invalid channel")

    token = secrets.token_urlsafe(32)
    new_webhook = Webhook(
        server_id=server_id,
        channel_id=webhook.channel_id,
        name=name,
        token=token
    )
    db.add(new_webhook)
    await db.commit()
    await db.refresh(new_webhook)
    return new_webhook

@router.delete("/api/servers/{server_id}/webhooks/{webhook_id}")
async def delete_webhook(server_id: int, webhook_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _ensure_can_manage_server(server_id, current_user.id, db)

    res = await db.execute(select(Webhook).where(Webhook.id == webhook_id, Webhook.server_id == server_id))
    webhook = res.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    await db.delete(webhook)
    await db.commit()
    return {"message": "Webhook deleted"}

@router.post("/api/webhooks/{token}")
async def execute_webhook(token: str, payload: WebhookExecute, db: AsyncSession = Depends(get_db)):
    if not payload.content or not payload.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    content = payload.content.strip()[:4000]

    res = await db.execute(select(Webhook).where(Webhook.token == token))
    webhook = res.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail="Invalid webhook token")

    res = await db.execute(select(Server).where(Server.id == webhook.server_id))
    server = res.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Webhook server not found")
    
    new_msg = Message(
        channel_id=webhook.channel_id,
        user_id=server.owner_id,
        content=content,
        webhook_id=webhook.id,
        custom_username=(payload.username or webhook.name)[:100],
        custom_avatar_url=payload.avatar_url[:500] if payload.avatar_url else None
    )
    db.add(new_msg)
    await db.commit()
    await db.refresh(new_msg)
    
    from app.socket_events import sio
    
    res = await db.execute(
        select(Message)
        .options(selectinload(Message.author))
        .where(Message.id == new_msg.id)
    )
    full_msg = res.scalar_one()
    
    msg_dict = {
        "id": full_msg.id,
        "channel_id": full_msg.channel_id,
        "user_id": full_msg.user_id,
        "content": full_msg.content,
        "attachments_json": full_msg.attachments_json,
        "parent_id": full_msg.parent_id,
        "webhook_id": full_msg.webhook_id,
        "custom_username": full_msg.custom_username,
        "custom_avatar_url": full_msg.custom_avatar_url,
        "created_at": full_msg.created_at.isoformat(),
        "author": {
            "id": full_msg.author.id,
            "public_id": full_msg.author.public_id,
            "username": full_msg.author.username,
            "avatar_url": full_msg.author.avatar_url,
            "status": full_msg.author.status
        },
        "reactions": []
    }
    
    await sio.emit("new_message", msg_dict, room=f"channel_{webhook.channel_id}")
    return {"message": "Success", "id": new_msg.id}
