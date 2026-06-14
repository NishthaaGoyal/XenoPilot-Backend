"""
XenoPilot Backend – FastAPI Application Entry Point
"""

import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from db.session import engine, Base
from api import customers, audiences, campaigns, analytics, recommendations, webhooks

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Seed data on startup if enabled
    if settings.seed_on_startup:
        try:
            from seed.seed_data import seed
            await seed(settings.database_url)
        except Exception as e:
            print(f"Seed warning: {e}")

    yield

    await engine.dispose()


app = FastAPI(
    title="XenoPilot API",
    description="AI-Powered Campaign Copilot for Consumer Brands",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(customers.router)
app.include_router(audiences.router)
app.include_router(campaigns.router)
app.include_router(analytics.router)
app.include_router(recommendations.router)
app.include_router(webhooks.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "xenopilot-backend"}
