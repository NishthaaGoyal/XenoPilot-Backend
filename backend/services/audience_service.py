"""
Audience Service – translates AI filters into SQL, runs queries, returns audience.
"""

from datetime import datetime, timedelta
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, text
from models.database import Customer
from schemas.pydantic_models import AudienceFilter, AudienceMetrics, AudienceResponse, CustomerOut
import services.ai_service as ai_service


async def generate_audience(query: str, db: AsyncSession) -> AudienceResponse:
    """
    1. Get DB stats for AI context
    2. AI interprets query → filters
    3. Apply filters to DB
    4. Calculate metrics
    5. Return full audience response
    """

    # Gather lightweight stats for AI context
    stats = await _get_db_stats(db)

    # AI interprets intent → structured filters
    ai_result = await ai_service.interpret_audience_query(query, stats)

    filters = ai_result.get("filters", [])
    explanation = ai_result.get("explanation", "Audience generated based on your query.")
    why_selected = ai_result.get("why_selected", "These customers match your specified criteria.")

    # Build and execute SQL filters
    customers = await _apply_filters(filters, db)

    # Calculate audience metrics
    if customers:
        now = datetime.utcnow()
        total_spend = sum(c.total_spent for c in customers)
        avg_spend = total_spend / len(customers)

        days_since_list = []
        for c in customers:
            if c.last_purchase_date:
                delta = (now - c.last_purchase_date).days
                days_since_list.append(delta)

        avg_days = sum(days_since_list) / len(days_since_list) if days_since_list else 0

        # Recoverable revenue = avg_spend * 30% recovery assumption
        recoverable = avg_spend * len(customers) * 0.30

        city_breakdown: dict[str, int] = {}
        channel_breakdown: dict[str, int] = {}
        for c in customers:
            city_breakdown[c.city] = city_breakdown.get(c.city, 0) + 1
            channel_breakdown[c.preferred_channel] = channel_breakdown.get(c.preferred_channel, 0) + 1

        metrics = AudienceMetrics(
            audience_size=len(customers),
            avg_spend=round(avg_spend, 2),
            avg_days_since_purchase=round(avg_days, 1),
            recoverable_revenue=round(recoverable, 2),
            city_breakdown=city_breakdown,
            channel_breakdown=channel_breakdown,
        )
    else:
        metrics = AudienceMetrics(
            audience_size=0,
            avg_spend=0,
            avg_days_since_purchase=0,
            recoverable_revenue=0,
            city_breakdown={},
            channel_breakdown={},
        )

    # Convert ORM objects → Pydantic
    customer_outs = [CustomerOut.model_validate(c) for c in customers[:200]]  # Cap at 200 for response size

    parsed_filters = [AudienceFilter(**f) for f in filters]

    return AudienceResponse(
        query=query,
        explanation=explanation,
        why_selected=why_selected,
        filters_applied=parsed_filters,
        metrics=metrics,
        customers=customer_outs,
    )


async def _get_db_stats(db: AsyncSession) -> dict:
    result = await db.execute(select(func.count(Customer.id), func.avg(Customer.total_spent)))
    row = result.one()
    return {"total_customers": row[0] or 0, "avg_spend": float(row[1] or 0)}


async def _apply_filters(filters: list[dict], db: AsyncSession) -> list[Customer]:
    """Convert AI filter objects into SQLAlchemy WHERE clauses."""

    now = datetime.utcnow()
    conditions = []

    for f in filters:
        field = f.get("field", "")
        operator = f.get("operator", "eq")
        value = f.get("value")

        if field == "total_spent":
            col = Customer.total_spent
            conditions.append(_apply_op(col, operator, float(value)))

        elif field == "days_since_purchase":
            cutoff = now - timedelta(days=int(value))
            if operator in ("gte", "gt"):
                conditions.append(Customer.last_purchase_date <= cutoff)
            else:
                conditions.append(Customer.last_purchase_date >= cutoff)

        elif field == "health_status":
            conditions.append(Customer.health_status == str(value))

        elif field == "order_count":
            col = Customer.order_count
            conditions.append(_apply_op(col, operator, int(value)))

        elif field == "city":
            conditions.append(Customer.city == str(value))

        elif field == "age":
            col = Customer.age
            conditions.append(_apply_op(col, operator, int(value)))

        elif field == "preferred_channel":
            conditions.append(Customer.preferred_channel == str(value))

        elif field == "gender":
            conditions.append(Customer.gender == str(value))

    stmt = select(Customer)
    if conditions:
        stmt = stmt.where(and_(*conditions))

    stmt = stmt.limit(500)  # Hard cap

    result = await db.execute(stmt)
    return list(result.scalars().all())


def _apply_op(col, operator: str, value: Any):
    if operator in ("gte", ">="):
        return col >= value
    elif operator in ("lte", "<="):
        return col <= value
    elif operator in ("gt", ">"):
        return col > value
    elif operator in ("lt", "<"):
        return col < value
    else:
        return col == value
