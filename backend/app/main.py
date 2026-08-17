import os
import logging
import traceback

import socketio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.database import init_db
from app.routers import auth, servers, channels, dms, friends, roles, webhooks
from app.socket_events import sio

logger = logging.getLogger("discoalto")


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


DEBUG_EXCEPTIONS = env_flag("DEBUG_EXCEPTIONS", True)


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


@fastapi_app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled exception for %s %s",
        request.method,
        request.url.path,
        exc_info=(type(exc), exc, exc.__traceback__),
    )

    if DEBUG_EXCEPTIONS:
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Unhandled server exception",
                "debug": True,
                "method": request.method,
                "path": request.url.path,
                "exception_type": type(exc).__name__,
                "exception": str(exc),
                "traceback": "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)),
            },
        )

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )


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
