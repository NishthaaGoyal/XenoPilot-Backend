"""
Delivery Simulator – simulates the full message delivery lifecycle.

Flow per message:
  sent (immediate) → delivered (1-3s) → opened (5-20s, 70%) → clicked (10-40s, 45%) → converted (20-60s, 22%) / failed (5%)
"""

import asyncio
import random
import httpx
from datetime import datetime, timezone


# Per-channel engagement benchmarks (probabilities)
CHANNEL_PROFILES = {
    "whatsapp": {
        "delivery_rate": 0.96,
        "open_rate": 0.74,
        "click_rate": 0.41,
        "convert_rate": 0.18,
        "fail_rate": 0.04,
    },
    "sms": {
        "delivery_rate": 0.94,
        "open_rate": 0.52,
        "click_rate": 0.22,
        "convert_rate": 0.09,
        "fail_rate": 0.06,
    },
    "email": {
        "delivery_rate": 0.91,
        "open_rate": 0.34,
        "click_rate": 0.12,
        "convert_rate": 0.05,
        "fail_rate": 0.09,
    },
}

DEFAULT_PROFILE = CHANNEL_PROFILES["email"]


async def _post_event(webhook_url: str, communication_id: str, event_type: str, client: httpx.AsyncClient):
    payload = {
        "communication_id": communication_id,
        "event_type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        await client.post(webhook_url, json=payload, timeout=10.0)
    except Exception as e:
        print(f"Webhook error ({event_type} → {communication_id}): {e}")


async def simulate_delivery(
    communication_id: str,
    channel: str,
    webhook_url: str,
):
    """
    Runs the full delivery simulation as a background asyncio task.
    Posts events back to the CRM webhook as they occur.
    """
    profile = CHANNEL_PROFILES.get(channel.lower(), DEFAULT_PROFILE)

    async with httpx.AsyncClient() as client:

        # 1. sent – immediate
        await _post_event(webhook_url, communication_id, "sent", client)

        # 2. delivered or failed
        await asyncio.sleep(random.uniform(0.5, 2.5))

        if random.random() < profile["fail_rate"]:
            await _post_event(webhook_url, communication_id, "failed", client)
            return  # Stop here – message failed

        await _post_event(webhook_url, communication_id, "delivered", client)

        # 3. opened (probabilistic)
        await asyncio.sleep(random.uniform(3, 15))
        if random.random() > profile["open_rate"]:
            return

        await _post_event(webhook_url, communication_id, "opened", client)

        # 4. clicked (probabilistic, conditional on open)
        await asyncio.sleep(random.uniform(5, 25))
        click_given_open = profile["click_rate"] / profile["open_rate"]
        if random.random() > click_given_open:
            return

        await _post_event(webhook_url, communication_id, "clicked", client)

        # 5. converted (probabilistic, conditional on click)
        await asyncio.sleep(random.uniform(10, 40))
        conv_given_click = profile["convert_rate"] / max(profile["click_rate"], 0.01)
        if random.random() > conv_given_click:
            return

        await _post_event(webhook_url, communication_id, "converted", client)
