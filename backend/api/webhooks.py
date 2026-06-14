from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from db.session import get_db
from models.database import Communication, Event
from schemas.pydantic_models import WebhookEvent

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Map channel service events to communication status (last/worst wins)
_STATUS_PRIORITY = {
    "pending": 0,
    "sent": 1,
    "delivered": 2,
    "opened": 3,
    "clicked": 4,
    "converted": 5,
    "failed": 6,
}


@router.post("/events")
async def receive_event(payload: WebhookEvent, db: AsyncSession = Depends(get_db)):
    """
    Receives delivery events from the Channel Service.
    Persists event and updates communication status.
    """

    # Persist the event
    event = Event(
        communication_id=payload.communication_id,
        event_type=payload.event_type,
        timestamp=payload.timestamp,
    )
    db.add(event)

    # Update communication status (only advance, never regress — except 'failed')
    result = await db.execute(
        select(Communication).where(Communication.id == payload.communication_id)
    )
    comm = result.scalar_one_or_none()

    if comm:
        current_priority = _STATUS_PRIORITY.get(comm.status, 0)
        new_priority = _STATUS_PRIORITY.get(payload.event_type, 0)

        # Always record 'failed'; advance status otherwise
        if payload.event_type == "failed" or new_priority > current_priority:
            comm.status = payload.event_type
            comm.updated_at = datetime.utcnow()

    await db.commit()
    return {"received": True, "event_type": payload.event_type}
