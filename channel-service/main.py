"""
XenoPilot Channel Service – completely independent FastAPI service.
Receives send requests from CRM, simulates delivery, posts events back.
"""

import asyncio
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from services.delivery_simulator import simulate_delivery

CRM_WEBHOOK_URL = os.getenv("CRM_WEBHOOK_URL", "http://localhost:8000/webhooks/events")

app = FastAPI(
    title="XenoPilot Channel Service",
    description="Message delivery simulation service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SendRequest(BaseModel):
    communication_id: str
    recipient: str
    channel: str
    message: str
    crm_webhook_url: str | None = None


@app.post("/send")
async def send_message(body: SendRequest):
    """
    Accept a send request and fire-and-forget the delivery simulation.
    Returns immediately; events are posted asynchronously to the CRM webhook.
    """
    webhook_url = body.crm_webhook_url or CRM_WEBHOOK_URL

    # Fire and forget – do not await
    asyncio.create_task(
        simulate_delivery(
            communication_id=body.communication_id,
            channel=body.channel,
            webhook_url=webhook_url,
        )
    )

    return {
        "accepted": True,
        "communication_id": body.communication_id,
        "channel": body.channel,
        "message": "Delivery simulation started. Events will be posted to CRM webhook.",
    }


@app.get("/health")
async def health():
    return {"status": "ok", "service": "xenopilot-channel-service"}
