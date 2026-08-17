import json
import secrets
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User, Server, ServerMember, Channel
from app.schemas import UserCreate, UserLogin, TokenResponse, UserResponse, UserStatusUpdate, UserProfileUpdate, UserSettingsUpdate
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

ALLOWED_STATUSES = {"online", "idle", "dnd", "offline"}
MAX_SETTINGS_JSON_LENGTH = 20_000


def _clean_text(value, max_length: int) -> str:
    return str(value or "").strip()[:max_length]


def _validate_password(password: str):
    if len(password or "") < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(status_code=400, detail="Password must be 72 bytes or fewer")

@router.post("/register", response_model=TokenResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    username = _clean_text(user_in.username, 50)
    email = _clean_text(user_in.email, 120).lower()
    avatar = _clean_text(user_in.avatar_url, 500) if user_in.avatar_url else None
    if not username:
        raise HTTPException(status_code=400, detail="Username cannot be empty")
    _validate_password(user_in.password)

    # Check if username or email already exists
    res = await db.execute(select(User).where((User.username == username) | (User.email == email)))
    existing_user = res.scalar_one_or_none()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or Email already registered")

    # Pick default avatar if none provided
    avatar = avatar or f"https://api.dicebear.com/7.x/bottts/svg?seed={username}"

    new_user = User(
        username=username,
        email=email,
        hashed_password=get_password_hash(user_in.password),
        avatar_url=avatar,
        status="online"
    )
    db.add(new_user)
    await db.flush()

    # Create default server for new user
    invite_code = secrets.token_urlsafe(8)[:8]
    default_server = Server(
        name=f"{username}'s Server"[:100],
        invite_code=invite_code,
        owner_id=new_user.id
    )
    db.add(default_server)
    await db.flush()

    member = ServerMember(server_id=default_server.id, user_id=new_user.id, role="owner")
    db.add(member)

    ch_text = Channel(server_id=default_server.id, name="general", type="text", category="Text Channels", position=0)
    ch_voice = Channel(server_id=default_server.id, name="Lounge", type="voice", category="Voice Channels", position=1)
    ch_media = Channel(server_id=default_server.id, name="p2p-lounge", type="media", category="Media Channels", position=2)
    db.add_all([ch_text, ch_voice, ch_media])

    await db.commit()
    await db.refresh(new_user)

    token = create_access_token(data={"sub": str(new_user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(new_user))

@router.post("/login", response_model=TokenResponse)
async def login(user_in: UserLogin, db: AsyncSession = Depends(get_db)):
    email = _clean_text(user_in.email, 120).lower()
    res = await db.execute(select(User).where(User.email == email))
    user = res.scalar_one_or_none()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(data={"sub": str(user.id)})
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)

@router.put("/status", response_model=UserResponse)
async def update_status(
    status_in: UserStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    status_value = _clean_text(status_in.status, 20)
    if status_value not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    current_user.status = status_value
    if status_in.status_message is not None:
        current_user.status_message = _clean_text(status_in.status_message, 100) or None
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)

@router.put("/profile", response_model=UserResponse)
async def update_profile(
    profile_in: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if profile_in.username is not None:
        username = _clean_text(profile_in.username, 50)
        if not username:
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        if username != current_user.username:
            res = await db.execute(select(User).where(User.username == username))
            if res.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Username already taken")
            current_user.username = username

    if profile_in.email is not None:
        email = _clean_text(profile_in.email, 120).lower()
        if email != current_user.email:
            res = await db.execute(select(User).where(User.email == email))
            if res.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Email already registered")
            current_user.email = email

    if profile_in.avatar_url is not None:
        current_user.avatar_url = _clean_text(profile_in.avatar_url, 500) or None

    if profile_in.status_message is not None:
        current_user.status_message = _clean_text(profile_in.status_message, 100) or None

    if profile_in.new_password:
        _validate_password(profile_in.new_password)
        if not profile_in.current_password or not verify_password(profile_in.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Current password incorrect")
        current_user.hashed_password = get_password_hash(profile_in.new_password)

    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)

@router.get("/settings")
async def get_settings(
    current_user: User = Depends(get_current_user)
):
    """Get saved user preferences from the database."""
    if current_user.settings_json:
        try:
            return json.loads(current_user.settings_json)
        except Exception:
            return {}
    return {}

@router.put("/settings")
async def save_settings(
    settings_in: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Save user preferences to the database."""
    settings_json = json.dumps(settings_in.settings)
    if len(settings_json) > MAX_SETTINGS_JSON_LENGTH:
        raise HTTPException(status_code=400, detail="Settings payload is too large")
    current_user.settings_json = settings_json
    await db.commit()
    return {"ok": True}
