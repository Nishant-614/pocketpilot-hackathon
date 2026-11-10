import uuid
import httpx
from decimal import Decimal
from typing import Any, Dict
from app.core.config import settings

async def get_paypal_access_token() -> str:
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{settings.PAYPAL_BASE_URL}/v1/oauth2/token",
            auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET),
            data={"grant_type": "client_credentials"},
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()["access_token"]

async def create_sandbox_order(
    amount: Decimal, currency: str, description: str
) -> Dict[str, Any]:
    if not settings.PAYPAL_CLIENT_ID or settings.PAYPAL_CLIENT_ID.startswith("replace_"):
        mock_id = f"SANDBOX-ORDER-{uuid.uuid4().hex[:10].upper()}"
        return {
            "id": mock_id,
            "status": "CREATED",
            "mode": "sandbox_mock",
            "links": [
                {
                    "href": f"https://www.sandbox.paypal.com/checkoutnow?token={mock_id}",
                    "rel": "approve",
                    "method": "GET"
                }
            ]
        }

    token = await get_paypal_access_token()
    request_id = str(uuid.uuid4())
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "description": description[:127],
                "amount": {
                    "currency_code": currency.upper(),
                    "value": f"{amount:.2f}",
                },
            }
        ],
        "application_context": {
            "return_url": f"{settings.FRONTEND_URL}/payments?status=approved",
            "cancel_url": f"{settings.FRONTEND_URL}/payments?status=cancelled",
            "user_action": "PAY_NOW",
        },
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{settings.PAYPAL_BASE_URL}/v2/checkout/orders",
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "PayPal-Request-Id": request_id,
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()
        return resp.json()

async def capture_sandbox_order(order_id: str) -> Dict[str, Any]:
    if order_id.startswith("SANDBOX-ORDER-"):
        return {
            "id": order_id,
            "status": "COMPLETED",
            "purchase_units": [
                {
                    "payments": {
                        "captures": [
                            {"id": f"CAP-{uuid.uuid4().hex[:10].upper()}", "status": "COMPLETED"}
                        ]
                    }
                }
            ]
        }

    token = await get_paypal_access_token()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{settings.PAYPAL_BASE_URL}/v2/checkout/orders/{order_id}/capture",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        resp.raise_for_status()
        return resp.json()

async def verify_paypal_webhook(headers: Dict[str, str], event_body: Dict[str, Any]) -> bool:
    if not settings.PAYPAL_WEBHOOK_ID or settings.PAYPAL_WEBHOOK_ID.startswith("replace_"):
        return False
    token = await get_paypal_access_token()
    verification_payload = {
        "auth_algo": headers.get("paypal-auth-algo"),
        "cert_url": headers.get("paypal-cert-url"),
        "transmission_id": headers.get("paypal-transmission-id"),
        "transmission_sig": headers.get("paypal-transmission-sig"),
        "transmission_time": headers.get("paypal-transmission-time"),
        "webhook_id": settings.PAYPAL_WEBHOOK_ID,
        "webhook_event": event_body,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{settings.PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature",
            json=verification_payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        if resp.status_code != 200:
            return False
        return resp.json().get("verification_status") == "SUCCESS"
