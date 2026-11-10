from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import get_db
from app.models.entities import (
    User, Transaction, Group, GroupMember, Expense, ExpenseSplit,
    Subscription, PaymentEvent, WebhookEvent
)
from app.schemas.payloads import (
    GroupCreateRequest, MemberCreateRequest, ExpenseCreateRequest,
    CreateOrderRequest, CaptureOrderRequest, ChatRequest
)
from app.services.group_service import calculate_equal_splits, compute_net_balances_and_settlements
from app.services.paypal_service import (
    create_sandbox_order, capture_sandbox_order, verify_paypal_webhook
)
from app.ai.orchestrator import handle_user_chat

router = APIRouter()

def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=401, detail="Demo user not initialized")
    return user

@router.get("/me")
def read_me(user: User = Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "email": user.email}

@router.get("/transactions")
def list_transactions(
    category: Optional[str] = None,
    currency: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Transaction).filter(Transaction.user_id == user.id)
    if category:
        q = q.filter(func.lower(Transaction.category) == category.lower())
    if currency:
        q = q.filter(Transaction.currency == currency.upper())
    rows = q.order_by(Transaction.occurred_at.desc()).all()
    return [
        {
            "id": r.id,
            "source": r.source,
            "merchant": r.merchant,
            "category": r.category,
            "amount": f"{r.amount:.2f}",
            "currency": r.currency,
            "status": r.status,
            "occurred_at": r.occurred_at.isoformat(),
        }
        for r in rows
    ]

@router.get("/transactions/search")
def search_transactions(
    q: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pattern = f"%{q.lower()}%"
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            (func.lower(Transaction.merchant).like(pattern)) | (func.lower(Transaction.category).like(pattern))
        )
        .order_by(Transaction.occurred_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "merchant": r.merchant,
            "category": r.category,
            "amount": f"{r.amount:.2f}",
            "currency": r.currency,
            "source": r.source,
            "status": r.status,
            "occurred_at": r.occurred_at.isoformat(),
        }
        for r in rows
    ]

@router.get("/analytics/summary")
def analytics_summary(
    currency: str = "INR",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.currency == currency.upper(),
            Transaction.status == "COMPLETED",
        )
        .all()
    )
    by_category = {}
    total = Decimal("0.00")
    for r in rows:
        cat = r.category.lower()
        by_category[cat] = by_category.get(cat, Decimal("0.00")) + r.amount
        total += r.amount

    return {
        "currency": currency.upper(),
        "total_completed_spend": f"{total:.2f}",
        "by_category": {k: f"{v:.2f}" for k, v in by_category.items()},
        "transaction_count": len(rows),
        "contains_demo_data": any(r.source == "demo" for r in rows),
    }

@router.get("/groups")
def list_groups(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    groups = db.query(Group).order_by(Group.id.asc()).all()
    return [
        {
            "id": g.id,
            "name": g.name,
            "currency": g.currency,
            "members": [{"id": m.id, "display_name": m.display_name, "role": m.role} for m in g.members],
            "expense_count": len(g.expenses),
        }
        for g in groups
    ]

@router.post("/groups")
def create_group(
    req: GroupCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    grp = Group(name=req.name, created_by=user.id, currency=req.currency.upper())
    db.add(grp)
    db.flush()

    owner_member = GroupMember(group_id=grp.id, user_id=user.id, display_name=user.name, role="admin")
    db.add(owner_member)
    for m_name in req.initial_members:
        if m_name.strip():
            db.add(GroupMember(group_id=grp.id, display_name=m_name.strip(), role="member"))

    db.commit()
    db.refresh(grp)
    return {
        "id": grp.id,
        "name": grp.name,
        "currency": grp.currency,
        "members": [{"id": m.id, "display_name": m.display_name, "role": m.role} for m in grp.members],
    }

@router.post("/groups/{group_id}/members")
def add_group_member(
    group_id: int,
    req: MemberCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    grp = db.query(Group).filter(Group.id == group_id).first()
    if not grp:
        raise HTTPException(status_code=404, detail="Group not found")
    member = GroupMember(group_id=grp.id, display_name=req.display_name, role=req.role)
    db.add(member)
    db.commit()
    db.refresh(member)
    return {"id": member.id, "group_id": grp.id, "display_name": member.display_name, "role": member.role}

@router.post("/groups/{group_id}/expenses")
def add_group_expense(
    group_id: int,
    req: ExpenseCreateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    grp = db.query(Group).filter(Group.id == group_id).first()
    if not grp:
        raise HTTPException(status_code=404, detail="Group not found")
    if req.currency.upper() != grp.currency.upper():
        raise HTTPException(status_code=400, detail="Expense currency must match group currency")

    member_ids = [m.id for m in grp.members]
    if req.payer_member_id not in member_ids:
        raise HTTPException(status_code=400, detail="Payer must be a member of the group")

    participants = req.participant_member_ids or member_ids
    for pid in participants:
        if pid not in member_ids:
            raise HTTPException(status_code=400, detail=f"Member {pid} does not belong to this group")

    splits_map = calculate_equal_splits(req.amount, participants)

    exp = Expense(
        group_id=grp.id,
        payer_member_id=req.payer_member_id,
        description=req.description,
        amount=req.amount,
        currency=grp.currency,
    )
    db.add(exp)
    db.flush()

    for m_id, share in splits_map.items():
        paid = req.amount if m_id == req.payer_member_id else Decimal("0.00")
        db.add(
            ExpenseSplit(
                expense_id=exp.id,
                member_id=m_id,
                share_amount=share,
                paid_amount=paid,
            )
        )

    db.commit()
    db.refresh(exp)
    return {
        "expense_id": exp.id,
        "description": exp.description,
        "amount": f"{exp.amount:.2f}",
        "currency": exp.currency,
        "splits": [
            {"member_id": s.member_id, "share_amount": f"{s.share_amount:.2f}"}
            for s in exp.splits
        ],
    }

@router.get("/groups/{group_id}/balances")
def get_group_balances(
    group_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    grp = db.query(Group).filter(Group.id == group_id).first()
    if not grp:
        raise HTTPException(status_code=404, detail="Group not found")

    members = {m.id: m.display_name for m in grp.members}
    paid_by = {m.id: Decimal("0.00") for m in grp.members}
    owed_by = {m.id: Decimal("0.00") for m in grp.members}

    expense_list = []
    for exp in grp.expenses:
        paid_by[exp.payer_member_id] = paid_by.get(exp.payer_member_id, Decimal("0.00")) + exp.amount
        for s in exp.splits:
            owed_by[s.member_id] = owed_by.get(s.member_id, Decimal("0.00")) + s.share_amount
        expense_list.append({
            "id": exp.id,
            "description": exp.description,
            "amount": f"{exp.amount:.2f}",
            "currency": exp.currency,
            "payer_member_id": exp.payer_member_id,
            "payer_name": members.get(exp.payer_member_id, "Member"),
            "occurred_at": exp.occurred_at.isoformat(),
        })

    balances, settlements = compute_net_balances_and_settlements(members, paid_by, owed_by, grp.currency)
    return {
        "group_id": grp.id,
        "group_name": grp.name,
        "currency": grp.currency,
        "members": [{"id": m.id, "display_name": m.display_name, "role": m.role} for m in grp.members],
        "expenses": expense_list,
        "balances": balances,
        "settlement_suggestions": settlements,
    }

@router.get("/payments")
def list_payments(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    events = (
        db.query(PaymentEvent)
        .filter(PaymentEvent.user_id == user.id)
        .order_by(PaymentEvent.created_at.desc())
        .all()
    )
    return [
        {
            "payment_id": e.id,
            "provider": e.provider,
            "provider_order_id": e.provider_order_id,
            "provider_capture_id": e.provider_capture_id,
            "merchant_name": e.merchant_name,
            "amount": f"{e.amount:.2f}",
            "currency": e.currency,
            "status": e.status,
            "created_at": e.created_at.isoformat(),
            "updated_at": e.updated_at.isoformat(),
        }
        for e in events
    ]

@router.get("/payments/{payment_id}")
def get_payment_detail(
    payment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    e = (
        db.query(PaymentEvent)
        .filter(PaymentEvent.id == payment_id, PaymentEvent.user_id == user.id)
        .first()
    )
    if not e:
        raise HTTPException(status_code=404, detail="Payment not found")
    return {
        "payment_id": e.id,
        "provider": e.provider,
        "provider_order_id": e.provider_order_id,
        "provider_capture_id": e.provider_capture_id,
        "merchant_name": e.merchant_name,
        "amount": f"{e.amount:.2f}",
        "currency": e.currency,
        "status": e.status,
        "created_at": e.created_at.isoformat(),
        "updated_at": e.updated_at.isoformat(),
    }

@router.post("/payments/create-order")
async def api_create_order(
    req: CreateOrderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not req.user_confirmed:
        raise HTTPException(status_code=400, detail="Explicit user confirmation is required before order creation.")

    order_resp = await create_sandbox_order(req.amount, req.currency, req.description)
    order_id = order_resp["id"]

    event = PaymentEvent(
        user_id=user.id,
        provider="PAYPAL_SANDBOX",
        provider_order_id=order_id,
        merchant_name=req.merchant_name,
        status=order_resp.get("status", "CREATED"),
        amount=req.amount,
        currency=req.currency.upper(),
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    approve_link = next((l["href"] for l in order_resp.get("links", []) if l.get("rel") == "approve"), None)
    return {
        "payment_id": event.id,
        "provider_order_id": event.provider_order_id,
        "merchant_name": event.merchant_name,
        "amount": f"{event.amount:.2f}",
        "currency": event.currency,
        "status": event.status,
        "approve_url": approve_link,
    }

@router.post("/payments/capture-order")
async def api_capture_order(
    req: CaptureOrderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = (
        db.query(PaymentEvent)
        .filter(
            PaymentEvent.user_id == user.id,
            PaymentEvent.provider_order_id == req.provider_order_id,
        )
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="Payment order not found")

    if event.status == "COMPLETED":
        return {
            "payment_id": event.id,
            "provider_order_id": event.provider_order_id,
            "provider_capture_id": event.provider_capture_id,
            "merchant_name": event.merchant_name,
            "amount": f"{event.amount:.2f}",
            "currency": event.currency,
            "status": event.status,
        }

    cap_resp = await capture_sandbox_order(req.provider_order_id)
    status = cap_resp.get("status", "FAILED")
    capture_id = None
    try:
        capture_id = cap_resp["purchase_units"][0]["payments"]["captures"][0]["id"]
    except (KeyError, IndexError):
        pass

    event.status = status
    event.provider_capture_id = capture_id

    if status == "COMPLETED":
        db.add(
            Transaction(
                user_id=user.id,
                source="sandbox",
                external_id=capture_id or event.provider_order_id,
                amount=event.amount,
                currency=event.currency,
                merchant=event.merchant_name,
                category="payments",
                status="COMPLETED",
            )
        )

    db.commit()
    return {
        "payment_id": event.id,
        "provider_order_id": event.provider_order_id,
        "provider_capture_id": event.provider_capture_id,
        "merchant_name": event.merchant_name,
        "amount": f"{event.amount:.2f}",
        "currency": event.currency,
        "status": event.status,
    }

@router.post("/payments/webhook")
async def paypal_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    event_id = body.get("id")
    if not event_id:
        raise HTTPException(status_code=400, detail="Missing webhook event id")

    existing = db.query(WebhookEvent).filter(WebhookEvent.provider_event_id == event_id).first()
    if existing:
        return {"status": "already_processed", "provider_event_id": event_id}

    headers = {k.lower(): v for k, v in request.headers.items()}
    is_verified = await verify_paypal_webhook(headers, body)

    wh = WebhookEvent(
        provider_event_id=event_id,
        event_type=body.get("event_type", "UNKNOWN"),
        verified=is_verified,
        payload_summary=str(body.get("resource", {}).get("id", "")),
    )
    db.add(wh)
    db.commit()
    return {"status": "recorded", "verified": is_verified}

@router.get("/subscriptions")
def list_subscriptions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    subs = db.query(Subscription).filter(Subscription.user_id == user.id).all()
    return [
        {
            "id": s.id,
            "merchant": s.merchant,
            "amount": f"{s.amount:.2f}",
            "currency": s.currency,
            "cadence": s.cadence,
            "confirmed": s.confirmed,
        }
        for s in subs
    ]

@router.post("/ai/chat")
def ai_chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return handle_user_chat(db, user.id, req.message)
