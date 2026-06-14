"""
Analytics Service – aggregates communication events into campaign metrics.
"""

import uuid
from datetime import datetime, timedelta
from collections import defaultdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from models.database import Campaign, Communication, Event, Customer
from schemas.pydantic_models import CampaignAnalytics


async def get_campaign_analytics(campaign_id: uuid.UUID, db: AsyncSession) -> CampaignAnalytics:
    # Fetch campaign
    camp_result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = camp_result.scalar_one_or_none()
    if not campaign:
        raise ValueError(f"Campaign {campaign_id} not found")

    # Fetch all communications for this campaign
    comm_result = await db.execute(
        select(Communication).where(Communication.campaign_id == campaign_id)
    )
    communications = list(comm_result.scalars().all())
    comm_ids = [c.id for c in communications]

    # Fetch all events for these communications
    events_by_type: dict[str, set[uuid.UUID]] = defaultdict(set)
    timeline_map: dict[str, int] = defaultdict(int)

    if comm_ids:
        event_result = await db.execute(
            select(Event).where(Event.communication_id.in_(comm_ids))
        )
        events = list(event_result.scalars().all())

        for ev in events:
            events_by_type[ev.event_type].add(ev.communication_id)
            hour_key = ev.timestamp.strftime("%Y-%m-%d %H:00")
            timeline_map[hour_key] += 1

    total_sent = len(communications)
    delivered = len(events_by_type.get("delivered", set()))
    opened = len(events_by_type.get("opened", set()))
    clicked = len(events_by_type.get("clicked", set()))
    converted = len(events_by_type.get("converted", set()))
    failed = len(events_by_type.get("failed", set()))

    # Rates (guard against division by zero)
    open_rate = opened / total_sent if total_sent > 0 else 0
    ctr = clicked / opened if opened > 0 else 0
    conversion_rate = converted / clicked if clicked > 0 else 0
    delivery_rate = delivered / total_sent if total_sent > 0 else 0

    # Estimated revenue: conversions × avg order value estimate
    estimated_revenue = converted * 1200  # ₹1200 avg order estimate

    # City breakdown via customer join
    city_breakdown: dict[str, int] = defaultdict(int)
    if comm_ids:
        cust_result = await db.execute(
            select(Customer.city, func.count(Communication.id))
            .join(Communication, Communication.customer_id == Customer.id)
            .where(Communication.campaign_id == campaign_id)
            .group_by(Customer.city)
        )
        for city, count in cust_result.all():
            city_breakdown[city] = count

    # Build sorted event timeline
    event_timeline = [
        {"time": k, "events": v}
        for k, v in sorted(timeline_map.items())
    ]

    return CampaignAnalytics(
        campaign_id=campaign_id,
        campaign_name=campaign.name,
        channel=campaign.channel,
        status=campaign.status,
        total_sent=total_sent,
        delivered=delivered,
        opened=opened,
        clicked=clicked,
        converted=converted,
        failed=failed,
        open_rate=round(open_rate, 4),
        ctr=round(ctr, 4),
        conversion_rate=round(conversion_rate, 4),
        delivery_rate=round(delivery_rate, 4),
        estimated_revenue=round(estimated_revenue, 2),
        city_breakdown=dict(city_breakdown),
        event_timeline=event_timeline,
    )


async def get_all_campaigns_summary(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Campaign).order_by(Campaign.created_at.desc())
    )
    campaigns = list(result.scalars().all())

    summaries = []
    for c in campaigns:
        # Quick comm count
        count_result = await db.execute(
            select(func.count(Communication.id)).where(Communication.campaign_id == c.id)
        )
        sent = count_result.scalar() or 0

        summaries.append({
            "id": str(c.id),
            "name": c.name,
            "goal": c.goal,
            "channel": c.channel,
            "status": c.status,
            "audience_size": c.audience_size,
            "sent": sent,
            "created_at": c.created_at.isoformat(),
            "launched_at": c.launched_at.isoformat() if c.launched_at else None,
        })

    return summaries
