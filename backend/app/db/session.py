from collections.abc import AsyncGenerator
from typing import Any

# Import entities to ensure they are registered with Base metadata
import app.db.models.entities  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Build SQLite async URL
sqlite_path = settings.storage.sqlite_path
db_url = f"sqlite+aiosqlite:///{sqlite_path}"

engine = create_async_engine(
    db_url,
    echo=settings.debug,
    connect_args={"check_same_thread": False},
)


# Enforce WAL mode and foreign keys for SQLite
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection: Any, connection_record: Any) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def init_db() -> None:
    """Initializes tables in database."""
    settings.storage.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for injecting database sessions into route handlers."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
