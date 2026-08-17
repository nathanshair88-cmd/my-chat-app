from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List

# User Schemas
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    avatar_url: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserStatusUpdate(BaseModel):
    status: str  # online, idle, dnd, offline
    status_message: Optional[str] = None

class UserProfileUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    avatar_url: Optional[str] = None
    status_message: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

class UserSettingsUpdate(BaseModel):
    settings: dict  # Arbitrary JSON settings object

class UserResponse(BaseModel):
    id: int
    public_id: str
    username: str
    email: EmailStr
    avatar_url: Optional[str] = None
    status: str
    status_message: Optional[str] = None
    settings_json: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class UserPublicResponse(BaseModel):
    id: int
    public_id: str
    username: str
    avatar_url: Optional[str] = None
    status: str
    status_message: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Reaction Schema
class ReactionResponse(BaseModel):
    id: int
    emoji: str
    user_id: int
    username: Optional[str] = None

    class Config:
        from_attributes = True

# Message Schemas
class MessageCreate(BaseModel):
    channel_id: int
    content: str
    attachments_json: Optional[str] = None
    parent_id: Optional[int] = None

class MessageResponse(BaseModel):
    id: int
    channel_id: int
    user_id: int
    content: str
    attachments_json: Optional[str] = None
    parent_id: Optional[int] = None
    webhook_id: Optional[int] = None
    custom_username: Optional[str] = None
    custom_avatar_url: Optional[str] = None
    created_at: datetime
    author: UserPublicResponse
    reactions: List[ReactionResponse] = []

    class Config:
        from_attributes = True

# Channel Schemas
class ChannelCreate(BaseModel):
    name: str
    type: str = "text"  # text, voice, media
    category: str = "General"

class ChannelResponse(BaseModel):
    id: int
    server_id: int
    name: str
    type: str
    category: str
    position: int

    class Config:
        from_attributes = True

# Server Schemas
class ServerMemberResponse(BaseModel):
    id: int
    server_id: int
    user_id: int
    role: str
    custom_role_id: Optional[int] = None
    joined_at: datetime
    user: UserPublicResponse

    class Config:
        from_attributes = True

class ServerCreate(BaseModel):
    name: str
    icon_url: Optional[str] = None

class RoleResponse(BaseModel):
    id: int
    server_id: int
    name: str
    color: str
    permissions: int
    
    class Config:
        from_attributes = True

class ServerResponse(BaseModel):
    id: int
    name: str
    icon_url: Optional[str] = None
    invite_code: str
    owner_id: int
    created_at: datetime
    channels: List[ChannelResponse] = []
    members: List[ServerMemberResponse] = []
    roles: List[RoleResponse] = []

    class Config:
        from_attributes = True

class ServerJoin(BaseModel):
    invite_code: str

# DM Schemas
class DirectMessageCreate(BaseModel):
    conversation_id: int
    content: str
    attachments_json: Optional[str] = None

class DirectMessageResponse(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    content: str
    attachments_json: Optional[str] = None
    is_read: bool = False
    created_at: datetime
    sender: UserPublicResponse

    class Config:
        from_attributes = True

class DMConversationResponse(BaseModel):
    id: int
    user1_id: int
    user2_id: int
    created_at: datetime
    other_user: UserPublicResponse
    unread_count: int = 0

    class Config:
        from_attributes = True
