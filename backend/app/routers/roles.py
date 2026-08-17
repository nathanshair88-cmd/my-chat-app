from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.database import get_db
from app.models import User, ServerRole, Server, ServerMember
from app.auth import get_current_user
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/servers", tags=["roles"])

class RoleCreate(BaseModel):
    name: str
    color: str = "#99aab5"
    permissions: int = 0

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    permissions: Optional[int] = None

class RoleResponse(BaseModel):
    id: int
    server_id: int
    name: str
    color: str
    permissions: int

class AssignRoleRequest(BaseModel):
    role_id: Optional[int]

async def _check_owner(server_id: int, user_id: int, db: AsyncSession):
    res = await db.execute(select(Server).where(Server.id == server_id))
    server = res.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    if server.owner_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized. Only the server owner can manage roles.")
    return server

@router.get("/{server_id}/roles", response_model=List[RoleResponse])
async def get_server_roles(server_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ServerRole).where(ServerRole.server_id == server_id))
    return res.scalars().all()

@router.post("/{server_id}/roles", response_model=RoleResponse)
async def create_server_role(server_id: int, req: RoleCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _check_owner(server_id, current_user.id, db)
    
    role = ServerRole(
        server_id=server_id,
        name=req.name,
        color=req.color,
        permissions=req.permissions
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return role

@router.put("/{server_id}/roles/{role_id}", response_model=RoleResponse)
async def update_server_role(server_id: int, role_id: int, req: RoleUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _check_owner(server_id, current_user.id, db)
    
    res = await db.execute(select(ServerRole).where(and_(ServerRole.id == role_id, ServerRole.server_id == server_id)))
    role = res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
        
    if req.name is not None: role.name = req.name
    if req.color is not None: role.color = req.color
    if req.permissions is not None: role.permissions = req.permissions
    
    await db.commit()
    await db.refresh(role)
    return role

@router.delete("/{server_id}/roles/{role_id}")
async def delete_server_role(server_id: int, role_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _check_owner(server_id, current_user.id, db)
    
    res = await db.execute(select(ServerRole).where(and_(ServerRole.id == role_id, ServerRole.server_id == server_id)))
    role = res.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
        
    await db.delete(role)
    await db.commit()
    return {"message": "Role deleted successfully"}

@router.post("/{server_id}/members/{user_id}/role")
async def assign_role_to_member(server_id: int, user_id: int, req: AssignRoleRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _check_owner(server_id, current_user.id, db)
    
    res = await db.execute(select(ServerMember).where(and_(ServerMember.server_id == server_id, ServerMember.user_id == user_id)))
    member = res.scalar_one_or_none()
    
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    if req.role_id is not None:
        # Verify role exists in server
        role_res = await db.execute(select(ServerRole).where(and_(ServerRole.id == req.role_id, ServerRole.server_id == server_id)))
        if not role_res.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Role not found in this server")
            
    member.custom_role_id = req.role_id
    await db.commit()
    return {"message": "Role assigned successfully"}
