import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import User, Server, ServerMember, Channel
from app.schemas import ServerCreate, ServerResponse, ServerJoin, ChannelCreate, ChannelResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/servers", tags=["servers"])

@router.post("", response_model=ServerResponse)
async def create_server(
    server_in: ServerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    invite_code = secrets.token_urlsafe(8)[:8]
    new_server = Server(
        name=server_in.name,
        icon_url=server_in.icon_url,
        invite_code=invite_code,
        owner_id=current_user.id
    )
    db.add(new_server)
    await db.flush()

    # Add owner as server member
    member = ServerMember(server_id=new_server.id, user_id=current_user.id, role="owner")
    db.add(member)

    # Create default channels
    ch_text = Channel(server_id=new_server.id, name="general", type="text", category="Text Channels", position=0)
    ch_voice = Channel(server_id=new_server.id, name="Lounge", type="voice", category="Voice Channels", position=1)
    ch_media = Channel(server_id=new_server.id, name="p2p-lounge", type="media", category="Media Channels", position=2)
    db.add_all([ch_text, ch_voice, ch_media])

    await db.commit()

    # Fetch full server object with channels and members
    res = await db.execute(
        select(Server)
        .options(
            selectinload(Server.channels),
            selectinload(Server.members).selectinload(ServerMember.user)
        )
        .where(Server.id == new_server.id)
    )
    full_server = res.scalar_one()
    return ServerResponse.model_validate(full_server)

@router.get("", response_model=list[ServerResponse])
async def get_my_servers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Server)
        .join(ServerMember)
        .where(ServerMember.user_id == current_user.id)
        .options(
            selectinload(Server.channels),
            selectinload(Server.members).selectinload(ServerMember.user)
        )
    )
    servers = res.scalars().all()
    return [ServerResponse.model_validate(s) for s in servers]

@router.get("/{server_id}", response_model=ServerResponse)
async def get_server(
    server_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Server)
        .options(
            selectinload(Server.channels),
            selectinload(Server.members).selectinload(ServerMember.user)
        )
        .where(Server.id == server_id)
    )
    server = res.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")

    # Check membership
    is_member = any(m.user_id == current_user.id for m in server.members)
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this server")

    return ServerResponse.model_validate(server)

@router.post("/join", response_model=ServerResponse)
async def join_server(
    join_in: ServerJoin,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    code = join_in.invite_code.strip()
    res = await db.execute(
        select(Server)
        .options(
            selectinload(Server.channels),
            selectinload(Server.members).selectinload(ServerMember.user)
        )
        .where(Server.invite_code == code)
    )
    server = res.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    is_member = any(m.user_id == current_user.id for m in server.members)
    if not is_member:
        new_member = ServerMember(server_id=server.id, user_id=current_user.id, role="member")
        db.add(new_member)
        await db.commit()
        # Refresh
        res = await db.execute(
            select(Server)
            .options(
                selectinload(Server.channels),
                selectinload(Server.members).selectinload(ServerMember.user)
            )
            .where(Server.id == server.id)
        )
        server = res.scalar_one()

    return ServerResponse.model_validate(server)

@router.post("/{server_id}/channels", response_model=ChannelResponse)
async def create_channel(
    server_id: int,
    channel_in: ChannelCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(ServerMember)
        .where(ServerMember.server_id == server_id, ServerMember.user_id == current_user.id)
    )
    member = res.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this server")

    new_channel = Channel(
        server_id=server_id,
        name=channel_in.name,
        type=channel_in.type,
        category=channel_in.category
    )
    db.add(new_channel)
    await db.commit()
    await db.refresh(new_channel)
    return ChannelResponse.model_validate(new_channel)
