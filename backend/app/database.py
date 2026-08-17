import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./discoalto_clone.db")

# Fix Render Postgres URLs if they use the old postgres:// scheme
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

if "?sslmode=require" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("?sslmode=require", "")

connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args["check_same_thread"] = False
elif "postgres" in DATABASE_URL:
    connect_args["ssl"] = "require"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args=connect_args
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

async def run_migrations(conn):
    """Safely add new columns to existing tables without breaking existing data."""
    migrations = [
        # Add settings_json column to users table if it doesn't exist
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS settings_json TEXT",
        "ALTER TABLE server_members ADD COLUMN custom_role_id INTEGER REFERENCES server_roles(id) ON DELETE SET NULL",
        "ALTER TABLE messages ADD COLUMN parent_id INTEGER REFERENCES messages(id) ON DELETE CASCADE",
    ]
    for sql in migrations:
        try:
            await conn.execute(text(sql))
        except Exception as e:
            # Column already exists or other non-fatal error — ignore
            print(f"Migration skipped (already applied?): {e}")

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await run_migrations(conn)
