import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from db.session import get_db
import services.analytics_service as analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/{campaign_id}")
async def get_analytics(campaign_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Full funnel analytics for a single campaign."""
    try:
        return await analytics_service.get_campaign_analytics(campaign_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
