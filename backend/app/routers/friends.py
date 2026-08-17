from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from app.database import get_db
from app.models import User, Friendship
from app.auth import get_current_user
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter(prefix="/friends", tags=["friends"])

class FriendRequest(BaseModel):
    username: str

class FriendResponse(BaseModel):
    id: int
    user_id: int
    friend_id: int
    status: str
    created_at: datetime
    friend_user: dict  # The other user's basic info

@router.get("/")
async def get_friends(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Fetch friendships where current user is either user_id or friend_id
    res = await db.execute(
        select(Friendship, User).join(
            User, 
            or_(
                and_(Friendship.user_id == current_user.id, User.id == Friendship.friend_id),
                and_(Friendship.friend_id == current_user.id, User.id == Friendship.user_id)
            )
        ).where(
            or_(Friendship.user_id == current_user.id, Friendship.friend_id == current_user.id)
        )
    )
    
    records = res.all()
    results = []
    
    for friendship, other_user in records:
        results.append({
            "id": friendship.id,
            "user_id": friendship.user_id,
            "friend_id": friendship.friend_id,
            "status": friendship.status,
            "created_at": friendship.created_at,
            "friend_user": {
                "id": other_user.id,
                "username": other_user.username,
                "avatar_url": other_user.avatar_url,
                "status": other_user.status,
                "status_message": other_user.status_message
            }
        })
        
    return results

@router.post("/request")
async def send_friend_request(req: FriendRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Find target user
    res = await db.execute(select(User).where(User.username == req.username))
    target_user = res.scalar_one_or_none()
    
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot send friend request to yourself")
        
    # Check if friendship already exists
    res = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.user_id == current_user.id, Friendship.friend_id == target_user.id),
                and_(Friendship.user_id == target_user.id, Friendship.friend_id == current_user.id)
            )
        )
    )
    existing = res.scalar_one_or_none()
    
    if existing:
        if existing.status == "accepted":
            raise HTTPException(status_code=400, detail="Already friends with this user")
        else:
            raise HTTPException(status_code=400, detail="Friend request already exists")
            
    # Create new request
    friendship = Friendship(user_id=current_user.id, friend_id=target_user.id, status="pending")
    db.add(friendship)
    await db.commit()
    await db.refresh(friendship)
    
    return {"message": "Friend request sent successfully", "id": friendship.id}

@router.put("/{friendship_id}/accept")
async def accept_friend_request(friendship_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Friendship).where(Friendship.id == friendship_id))
    friendship = res.scalar_one_or_none()
    
    if not friendship:
        raise HTTPException(status_code=404, detail="Friend request not found")
        
    # Only the receiver can accept
    if friendship.friend_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to accept this request")
        
    if friendship.status == "accepted":
        raise HTTPException(status_code=400, detail="Already accepted")
        
    friendship.status = "accepted"
    await db.commit()
    
    return {"message": "Friend request accepted"}

@router.delete("/{friendship_id}")
async def remove_friend(friendship_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Friendship).where(Friendship.id == friendship_id))
    friendship = res.scalar_one_or_none()
    
    if not friendship:
        raise HTTPException(status_code=404, detail="Friendship not found")
        
    # Must be one of the users
    if friendship.user_id != current_user.id and friendship.friend_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    await db.delete(friendship)
    await db.commit()
    
    return {"message": "Friend removed successfully"}
