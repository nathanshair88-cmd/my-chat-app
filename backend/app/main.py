import os

import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import init_db
from app.routers import auth, servers, channels, dms, friends, roles, webhooks
from app.socket_events import sio

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    await init_db()
    yield

fastapi_app = FastAPI(
    title="Disco Alto Clone API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup
default_cors_origins = "http://localhost:5173,http://127.0.0.1:5173,https://disco-alto.vercel.app"
cors_origins = [
    origin.strip()
    for origin in (os.getenv("CORS_ORIGINS") or default_cors_origins).split(",")
    if origin.strip()
]
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@fastapi_app.get("/")
async def root():
    return {"status": "online", "message": "Disco Alto Clone API Backend is running"}

# Include Routers
fastapi_app.include_router(auth.router)
fastapi_app.include_router(servers.router)
fastapi_app.include_router(channels.router)
fastapi_app.include_router(dms.router)
fastapi_app.include_router(friends.router)
fastapi_app.include_router(roles.router)
fastapi_app.include_router(webhooks.router)

# Mount Socket.IO ASGI app on /socket.io route
sio_app = socketio.ASGIApp(sio, socketio_path="")
fastapi_app.mount("/socket.io", sio_app)

app = fastapi_app
