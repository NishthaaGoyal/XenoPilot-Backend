import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from db.session import get_db
import services.analytics_service as analytics_service
import services.ai_service as ai_service

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("/{campaign_id}")
async def get_recommendations(campaign_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """AI-generated next best action recommendations from campaign results."""
    try:
        analytics = await analytics_service.get_campaign_analytics(campaign_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Build analytics dict for AI context
    top_city = max(analytics.city_breakdown, key=analytics.city_breakdown.get) if analytics.city_breakdown else "N/A"

    analytics_dict = {
        "campaign_name": analytics.campaign_name,
        "channel": analytics.channel,
        "total_sent": analytics.total_sent,
        "delivered": analytics.delivered,
        "opened": analytics.opened,
        "clicked": analytics.clicked,
        "converted": analytics.converted,
        "open_rate": analytics.open_rate,
        "ctr": analytics.ctr,
        "conversion_rate": analytics.conversion_rate,
        "estimated_revenue": analytics.estimated_revenue,
        "top_city": top_city,
    }

    insights = await ai_service.generate_campaign_insights(analytics_dict)
    insights["campaign_id"] = str(campaign_id)
    insights["top_performing_city"] = top_city
    return insights
