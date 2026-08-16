import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import init_db
from app.routers import auth, servers, channels, dms
from app.socket_events import sio

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    await init_db()
    yield

fastapi_app = FastAPI(
    title="Discord Clone API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
fastapi_app.include_router(auth.router)
fastapi_app.include_router(servers.router)
fastapi_app.include_router(channels.router)
fastapi_app.include_router(dms.router)


# Mount Socket.IO as ASGI app on top of FastAPI
app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=fastapi_app
)
