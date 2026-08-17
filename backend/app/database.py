import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.user_ids import generate_public_id

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


async def _run_sql(conn, sql: str, params: dict | None = None, ignore_errors: bool = True):
    try:
        await conn.execute(text(sql), params or {})
        await conn.commit()
        return True
    except Exception as e:
        await conn.rollback()
        if ignore_errors:
            print(f"Migration skipped (already applied?): {e}")
            return False
        raise


async def _column_exists(conn, table: str, column_name: str) -> bool:
    if conn.dialect.name == "sqlite":
        res = await conn.execute(text(f"PRAGMA table_info({table})"))
        return any(row[1] == column_name for row in res.all())

    if conn.dialect.name == "postgresql":
        res = await conn.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :table AND column_name = :column"
            ),
            {"table": table, "column": column_name},
        )
        return res.scalar_one_or_none() is not None

    return False


async def _add_column(conn, table: str, column_definition: str):
    column_name = column_definition.split()[0]
    if await _column_exists(conn, table, column_name):
        return

    if conn.dialect.name == "postgresql":
        await _run_sql(conn, f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column_definition}")
    else:
        await _run_sql(conn, f"ALTER TABLE {table} ADD COLUMN {column_definition}")


async def _drop_username_unique_index(conn):
    if conn.dialect.name == "postgresql":
        await _run_sql(conn, "ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key")
        await _run_sql(conn, "DROP INDEX IF EXISTS ix_users_username")
        await _run_sql(conn, "CREATE INDEX IF NOT EXISTS ix_users_username ON users (username)")
    else:
        await _run_sql(conn, "DROP INDEX IF EXISTS ix_users_username")
        await _run_sql(conn, "CREATE INDEX IF NOT EXISTS ix_users_username ON users (username)")


async def _backfill_public_user_ids(conn):
    await _add_column(conn, "users", "public_id VARCHAR(10)")

    res = await conn.execute(text("SELECT public_id FROM users WHERE public_id IS NOT NULL AND public_id <> ''"))
    used_ids = {row[0] for row in res.all()}

    res = await conn.execute(text("SELECT id FROM users WHERE public_id IS NULL OR public_id = '' ORDER BY id"))
    user_ids = [row[0] for row in res.all()]

    for user_id in user_ids:
        public_id = generate_public_id()
        while public_id in used_ids:
            public_id = generate_public_id()
        used_ids.add(public_id)
        await conn.execute(
            text("UPDATE users SET public_id = :public_id WHERE id = :user_id"),
            {"public_id": public_id, "user_id": user_id},
        )
    if user_ids:
        await conn.commit()

    await _run_sql(conn, "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_public_id ON users (public_id)")
    if conn.dialect.name == "postgresql":
        await _run_sql(conn, "ALTER TABLE users ALTER COLUMN public_id SET NOT NULL")


async def _normalize_member_roles(conn):
    await _run_sql(
        conn,
        "UPDATE server_members SET role = 'member' "
        "WHERE role IS NULL OR role NOT IN ('owner', 'admin', 'member')",
    )
    await _run_sql(
        conn,
        "UPDATE server_members SET role = 'owner' "
        "WHERE EXISTS ("
        "SELECT 1 FROM servers WHERE servers.id = server_members.server_id "
        "AND servers.owner_id = server_members.user_id)",
    )
    await _run_sql(
        conn,
        "UPDATE server_members SET role = 'member' "
        "WHERE role = 'owner' AND NOT EXISTS ("
        "SELECT 1 FROM servers WHERE servers.id = server_members.server_id "
        "AND servers.owner_id = server_members.user_id)",
    )


async def _dedupe_dm_conversations(conn):
    res = await conn.execute(text("SELECT id, user1_id, user2_id FROM dm_conversations ORDER BY id"))
    conversations = res.all()
    canonical_by_pair = {}

    for conv_id, user1_id, user2_id in conversations:
        if user1_id == user2_id:
            continue
        pair = tuple(sorted((user1_id, user2_id)))
        canonical_by_pair.setdefault(pair, conv_id)

    for conv_id, user1_id, user2_id in conversations:
        if user1_id == user2_id:
            await conn.execute(
                text("DELETE FROM direct_messages WHERE conversation_id = :conversation_id"),
                {"conversation_id": conv_id},
            )
            await conn.execute(
                text("DELETE FROM dm_conversations WHERE id = :conversation_id"),
                {"conversation_id": conv_id},
            )
            continue

        pair = tuple(sorted((user1_id, user2_id)))
        canonical_id = canonical_by_pair.get(pair)
        if canonical_id == conv_id:
            continue

        await conn.execute(
            text(
                "UPDATE direct_messages "
                "SET conversation_id = :canonical_id "
                "WHERE conversation_id = :duplicate_id"
            ),
            {"canonical_id": canonical_id, "duplicate_id": conv_id},
        )
        await conn.execute(
            text("DELETE FROM dm_conversations WHERE id = :duplicate_id"),
            {"duplicate_id": conv_id},
        )

    for conv_id, user1_id, user2_id in conversations:
        if user1_id == user2_id:
            continue
        pair = tuple(sorted((user1_id, user2_id)))
        if canonical_by_pair.get(pair) != conv_id or (user1_id, user2_id) == pair:
            continue

        await conn.execute(
            text(
                "UPDATE dm_conversations "
                "SET user1_id = :user1_id, user2_id = :user2_id "
                "WHERE id = :conversation_id"
            ),
            {"user1_id": pair[0], "user2_id": pair[1], "conversation_id": conv_id},
        )

    if conversations:
        await conn.commit()

    await _run_sql(
        conn,
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_dm_conversations_user_pair "
        "ON dm_conversations (user1_id, user2_id)",
    )


async def _dedupe_friendships(conn):
    res = await conn.execute(text("SELECT id, user_id, friend_id, status FROM friendships ORDER BY id"))
    friendships = res.all()
    canonical_by_pair = {}

    for friendship_id, user_id, friend_id, status in friendships:
        if user_id == friend_id:
            await conn.execute(
                text("DELETE FROM friendships WHERE id = :friendship_id"),
                {"friendship_id": friendship_id},
            )
            continue

        pair = tuple(sorted((user_id, friend_id)))
        existing_id, existing_status = canonical_by_pair.get(pair, (None, None))
        if existing_id is None:
            canonical_by_pair[pair] = (friendship_id, status)
            continue

        if status == "accepted" and existing_status != "accepted":
            await conn.execute(
                text("UPDATE friendships SET status = 'accepted', is_seen = 1 WHERE id = :friendship_id"),
                {"friendship_id": existing_id},
            )
            canonical_by_pair[pair] = (existing_id, "accepted")

        await conn.execute(
            text("DELETE FROM friendships WHERE id = :friendship_id"),
            {"friendship_id": friendship_id},
        )

    if friendships:
        await conn.commit()

    await _run_sql(
        conn,
        "UPDATE friendships SET status = 'pending' "
        "WHERE status IS NULL OR status NOT IN ('pending', 'accepted')",
    )
    await _run_sql(conn, "UPDATE friendships SET is_seen = 0 WHERE is_seen IS NULL")

    if conn.dialect.name == "postgresql":
        await _run_sql(
            conn,
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_friendships_user_pair "
            "ON friendships (LEAST(user_id, friend_id), GREATEST(user_id, friend_id))",
        )
    else:
        await _run_sql(
            conn,
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_friendships_user_pair "
            "ON friendships ("
            "CASE WHEN user_id < friend_id THEN user_id ELSE friend_id END, "
            "CASE WHEN user_id < friend_id THEN friend_id ELSE user_id END"
            ")",
        )


async def run_migrations(conn):
    """Safely migrate existing tables without breaking existing data."""
    await _backfill_public_user_ids(conn)
    await _drop_username_unique_index(conn)

    migrations = [
        ("users", "settings_json TEXT"),
        ("server_members", "custom_role_id INTEGER"),
        ("server_members", "role VARCHAR(50) DEFAULT 'member'"),
        ("messages", "parent_id INTEGER"),
        ("direct_messages", "is_read INTEGER DEFAULT 0"),
        ("friendships", "is_seen INTEGER DEFAULT 0"),
        ("messages", "webhook_id INTEGER"),
        ("messages", "custom_username TEXT"),
        ("messages", "custom_avatar_url TEXT"),
        ("messages", "updated_at TIMESTAMP"),
    ]
    for table, column_definition in migrations:
        await _add_column(conn, table, column_definition)

    await _normalize_member_roles(conn)
    await _dedupe_dm_conversations(conn)
    await _dedupe_friendships(conn)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with engine.connect() as conn:
        await run_migrations(conn)
