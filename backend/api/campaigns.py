import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from db.session import get_db
from schemas.pydantic_models import (
    CampaignGenerateRequest,
    CreateCampaignRequest,
    CampaignLaunchRequest,
)
import services.ai_service as ai_service
import services.campaign_service as campaign_service
import services.analytics_service as analytics_service

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.post("/generate")
async def generate_campaign(body: CampaignGenerateRequest):
    """AI generates campaign copy + channel recommendation in one step."""
    content = await ai_service.generate_campaign_content(
        audience_explanation=body.query,
        audience_size=body.audience_size,
        avg_spend=body.avg_spend,
        health_focus=body.health_focus,
        recoverable_revenue=body.recoverable_revenue,
    )
    return content


@router.post("/predict")
async def predict_outcomes(body: dict):
    """Predict campaign performance before launch."""
    result = await ai_service.predict_campaign_outcomes(
        channel=body.get("channel", "email"),
        audience_size=body.get("audience_size", 100),
        avg_spend=body.get("avg_spend", 3000),
        health_focus=body.get("health_focus", "mixed"),
    )
    return result


@router.post("/create")
async def create_campaign(body: CreateCampaignRequest, db: AsyncSession = Depends(get_db)):
    """Persist a drafted campaign to the database."""
    campaign = await campaign_service.create_campaign(body, db)
    return {
        "id": str(campaign.id),
        "name": campaign.name,
        "status": campaign.status,
        "created_at": campaign.created_at.isoformat(),
    }


@router.post("/launch")
async def launch_campaign(body: CampaignLaunchRequest, db: AsyncSession = Depends(get_db)):
    """Launch a campaign – creates communications and fires channel service."""
    try:
        campaign = await campaign_service.launch_campaign(body.campaign_id, db)
        return {
            "id": str(campaign.id),
            "status": campaign.status,
            "launched_at": campaign.launched_at.isoformat() if campaign.launched_at else None,
            "message": f"Campaign '{campaign.name}' launched successfully to {campaign.audience_size} customers.",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("")
async def list_campaigns(db: AsyncSession = Depends(get_db)):
    """List all campaigns with summary metrics."""
    return await analytics_service.get_all_campaigns_summary(db)
