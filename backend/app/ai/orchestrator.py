import json
import re
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import Transaction
from app.services.group_service import calculate_equal_splits

def is_configured_api_key(key: str) -> bool:
    if not key:
        return False
    lower = key.strip().lower()
    return not any(lower.startswith(prefix) for prefix in ["replace_", "your_", "dummy", "test", "none"])

client = None
if is_configured_api_key(settings.AI_PROVIDER_API_KEY):
    client = OpenAI(api_key=settings.AI_PROVIDER_API_KEY, timeout=8.0)

def execute_get_spending_summary(db: Session, user_id: int, category: str, days_back: int = 30, currency: str = "INR") -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days_back)
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            func.lower(Transaction.category) == category.lower(),
            Transaction.currency == currency.upper(),
            Transaction.status == "COMPLETED",
            Transaction.occurred_at >= start_date,
        )
        .all()
    )
    total = sum((r.amount for r in rows), Decimal("0.00"))
    sources = sorted(list({r.source for r in rows}))
    return {
        "tool": "get_spending_summary",
        "category": category.lower(),
        "currency": currency.upper(),
        "days_evaluated": days_back,
        "total_spent": f"{total:.2f}",
        "transaction_count": len(rows),
        "data_sources": sources,
        "contains_demo_data": "demo" in sources,
    }

def execute_calculate_split(amount: float, participant_count: int) -> Dict[str, Any]:
    if participant_count <= 0:
        return {"error": "Participant count must be greater than 0"}
    splits = calculate_equal_splits(Decimal(str(amount)), list(range(1, participant_count + 1)))
    return {
        "tool": "calculate_settlement",
        "total_amount": f"{amount:.2f}",
        "splits": {f"Person {k}": f"{v:.2f}" for k, v in splits.items()}
    }

def execute_propose_payment(merchant: str, amount: float, currency: str = "USD", description: str = "") -> Dict[str, Any]:
    return {
        "tool": "create_payment_order",
        "action": "REVIEW_REQUIRED",
        "requires_user_confirmation": True,
        "proposed_order": {
            "merchant": merchant,
            "amount": f"{amount:.2f}",
            "currency": currency.upper(),
            "description": description or f"Payment to {merchant}",
            "provider": "PayPal Sandbox Checkout (Orders v2)",
        },
        "message": f"Review required: Please review and confirm your {currency.upper()} {amount:.2f} payment to {merchant} before sandbox order creation.",
    }

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_spending_summary",
            "description": "Retrieve actual completed transaction spending from the database for a specific category.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "Category e.g. food, travel, subscriptions, shopping"},
                    "days_back": {"type": "integer", "description": "Number of days back from today"},
                    "currency": {"type": "string", "description": "Currency code e.g. INR or USD"}
                },
                "required": ["category"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_split",
            "description": "Calculate exact equal expense splits in integer minor units.",
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number", "description": "Total amount to divide"},
                    "participant_count": {"type": "integer", "description": "Number of participants"}
                },
                "required": ["amount", "participant_count"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "propose_payment_checkout",
            "description": "Prepare a supported PayPal Sandbox checkout order requiring explicit user confirmation.",
            "parameters": {
                "type": "object",
                "properties": {
                    "merchant": {"type": "string", "description": "Merchant name"},
                    "amount": {"type": "number", "description": "Amount to pay"},
                    "currency": {"type": "string", "description": "Currency code (default USD)"},
                    "description": {"type": "string", "description": "Order note"}
                },
                "required": ["merchant", "amount"]
            }
        }
    }
]

def handle_user_chat(db: Session, user_id: int, message: str) -> Dict[str, Any]:
    if not client:
        return _fallback_router(db, user_id, message)

    try:
        messages = [
            {
                "role": "system",
                "content": (
                    "You are PocketPilot AI, an autonomous personal finance companion. "
                    "Use tools to fetch actual transaction data and split balances. "
                    "Cite returned values accurately. Never execute payments directly; call 'propose_payment_checkout' to present the review screen."
                )
            },
            {"role": "user", "content": message}
        ]

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
            temperature=0.1
        )
        choice = response.choices[0].message

        if choice.tool_calls:
            call = choice.tool_calls[0]
            func_name = call.function.name
            args = json.loads(call.function.arguments)

            if func_name == "get_spending_summary":
                result = execute_get_spending_summary(
                    db, user_id,
                    category=args.get("category", "food"),
                    days_back=args.get("days_back", 30),
                    currency=args.get("currency", "INR")
                )
                messages.append(choice)
                messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})
                followup = client.chat.completions.create(model="gpt-4o-mini", messages=messages, temperature=0.2)
                return {"reply": followup.choices[0].message.content, "tool_output": result}

            elif func_name == "calculate_split":
                result = execute_calculate_split(args.get("amount", 0.0), args.get("participant_count", 1))
                shares = ", ".join([f"{k}: {v}" for k, v in result.get("splits", {}).items()])
                return {"reply": f"Equal split for {result.get('total_amount')}: {shares}.", "tool_output": result}

            elif func_name == "propose_payment_checkout":
                result = execute_propose_payment(args.get("merchant", "Merchant"), args.get("amount", 0.0), args.get("currency", "USD"), args.get("description", ""))
                return {"reply": result["message"], "tool_output": result}

        return {"reply": choice.content or "How can I assist you with your finances today?", "tool_output": None}

    except Exception as e:
        res = _fallback_router(db, user_id, message)
        res["reply"] = f"[{str(e)[:45]} | Offline Fallback] " + res["reply"]
        return res

def _fallback_router(db: Session, user_id: int, message: str) -> Dict[str, Any]:
    text_lower = message.lower()
    for cat in ["food", "travel", "subscriptions", "utilities", "shopping"]:
        if cat in text_lower and ("spend" in text_lower or "spent" in text_lower or "how much" in text_lower):
            result = execute_get_spending_summary(db, user_id, category=cat, days_back=30, currency="INR")
            demo_note = " (includes seeded demo records)" if result["contains_demo_data"] else ""
            return {
                "reply": f"You spent {result['currency']} {result['total_spent']} on {cat} across {result['transaction_count']} completed transactions in the last 30 days{demo_note}.",
                "tool_output": result
            }

    split_match = re.search(r"split\s+([\d,]+(?:\.\d{1,2})?)\s+.*?(\d+)", text_lower)
    if split_match:
        amt = float(split_match.group(1).replace(",", ""))
        count = int(split_match.group(2))
        result = execute_calculate_split(amt, count)
        shares = ", ".join([f"{k}: {v}" for k, v in result.get("splits", {}).items()])
        return {"reply": f"Equal split for {amt:.2f} among {count} participants: {shares}.", "tool_output": result}

    pay_match = re.search(r"pay\s+([a-zA-Z0-9_\-]+)\s+([\d]+(?:\.\d{1,2})?)", message, re.IGNORECASE)
    if pay_match:
        result = execute_propose_payment(pay_match.group(1), float(pay_match.group(2)), "USD", f"Checkout payment to {pay_match.group(1)}")
        return {"reply": result["message"], "tool_output": result}

    return {
        "reply": "I can help analyze your spending (e.g. 'How much did I spend on food?'), calculate fair splits (e.g. 'Split 3000 equally among 4 people'), or prepare a PayPal Sandbox checkout (e.g. 'Pay CloudHost 25').",
        "tool_output": None
    }
