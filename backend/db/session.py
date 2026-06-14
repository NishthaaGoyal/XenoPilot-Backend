from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import get_settings

settings = get_settings()

# Use SSL in production if connected to a remote DB (like Supabase)
is_production = "supabase.com" in settings.database_url or "onrender.com" in settings.database_url
connect_args = {"ssl": True} if is_production else {}

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=15,             # Supabase transaction pooler supports high concurrency
    max_overflow=20,          # Allow up to 35 total connections from this worker
    pool_recycle=1800,        # Recycle connections after 30 mins to avoid stale drops
    pool_timeout=30,          # Wait up to 30s for a free connection
    connect_args=connect_args
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
