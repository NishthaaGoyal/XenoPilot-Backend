"""
Campaign Service – creates campaigns, launches them, calls channel service.
"""

import uuid
import httpx
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.database import Campaign, Communication, Customer
from schemas.pydantic_models import CreateCampaignRequest
from config import get_settings

settings = get_settings()


async def create_campaign(data: CreateCampaignRequest, db: AsyncSession) -> Campaign:
    campaign = Campaign(
        name=data.name,
        goal=data.goal,
        channel=data.channel,
        status="draft",
        audience_filters=data.audience_filters,
        audience_size=data.audience_size,
        subject_line=data.subject_line,
        message_body=data.message_body,
        cta=data.cta,
        predicted_open_rate=data.predicted_open_rate,
        predicted_ctr=data.predicted_ctr,
        predicted_conversion_rate=data.predicted_conversion_rate,
        prediction_confidence=data.prediction_confidence,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def launch_campaign(campaign_id: uuid.UUID, db: AsyncSession) -> Campaign:
    """
    1. Fetch campaign + audience
    2. Create communication records
    3. Async-fire channel service for each communication
    4. Update campaign status to 'active'
    """

    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise ValueError(f"Campaign {campaign_id} not found")

    # Get audience customers based on stored filters
    customers = await _get_audience_customers(campaign, db)

    # Create communication records
    communications = []
    for customer in customers:
        msg = _personalise_message(campaign.message_body or "", customer.name)
        comm = Communication(
            campaign_id=campaign.id,
            customer_id=customer.id,
            message=msg,
            channel=campaign.channel,
            status="pending",
        )
        db.add(comm)
        communications.append((comm, customer))

    campaign.status = "active"
    campaign.launched_at = datetime.utcnow()
    await db.commit()

    # Re-fetch communications to get their IDs
    for comm, customer in communications:
        await db.refresh(comm)

    # Fire channel service asynchronously (don't await – fire and forget)
    import asyncio
    asyncio.create_task(
        _dispatch_to_channel_service(communications, campaign.channel)
    )

    return campaign


async def _get_audience_customers(campaign: Campaign, db: AsyncSession) -> list[Customer]:
    """Re-apply stored audience filters to get the target customer list."""

    from services.audience_service import _apply_filters
    filters = campaign.audience_filters or []
    if isinstance(filters, list) and len(filters) > 0:
        customers = await _apply_filters(filters, db)
    else:
        # Fallback: get a reasonable sample
        result = await db.execute(select(Customer).limit(campaign.audience_size or 50))
        customers = list(result.scalars().all())

    return customers[:campaign.audience_size or 500]


def _personalise_message(template: str, name: str) -> str:
    return template.replace("{name}", name.split()[0] if name else "there")


async def _dispatch_to_channel_service(
    communications: list[tuple],
    channel: str,
):
    """Fire all communications to the channel service in background."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        for comm, customer in communications:
            try:
                await client.post(
                    f"{settings.channel_service_url}/send",
                    json={
                        "communication_id": str(comm.id),
                        "recipient": customer.phone or customer.email,
                        "channel": channel,
                        "message": comm.message,
                        "crm_webhook_url": f"{settings.crm_base_url}/webhooks/events",
                    },
                )
            except Exception as e:
                print(f"Channel service dispatch error for {comm.id}: {e}")
