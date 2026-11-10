from contextlib import asynccontextmanager
from decimal import Decimal
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, SessionLocal
from app.models.entities import Base, User, Transaction, Subscription, Group, GroupMember
from app.api.routes import router

def seed_demo_data():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).first():
            return
        user = User(name="Nishant (Demo User)", email="demo@pocketpilot.local", password_hash="hashed_demo_pw")
        db.add(user)
        db.flush()

        now = datetime.now(timezone.utc)
        sample_txs = [
            ("Zomato", "food", Decimal("450.00"), "INR", 3),
            ("Swiggy Instamart", "food", Decimal("680.00"), "INR", 7),
            ("Campus Canteen", "food", Decimal("220.00"), "INR", 12),
            ("Uber India", "travel", Decimal("540.00"), "INR", 5),
            ("GitHub Copilot", "subscriptions", Decimal("10.00"), "USD", 15),
        ]
        for merchant, category, amt, curr, days_ago in sample_txs:
            db.add(
                Transaction(
                    user_id=user.id,
                    source="demo",
                    merchant=merchant,
                    category=category,
                    amount=amt,
                    currency=curr,
                    status="COMPLETED",
                    occurred_at=now - timedelta(days=days_ago),
                )
            )

        db.add(
            Subscription(
                user_id=user.id,
                merchant="GitHub Copilot",
                amount=Decimal("10.00"),
                currency="USD",
                cadence="MONTHLY",
                confirmed=True,
            )
        )

        grp = Group(name="Shillong Weekend Trip", created_by=user.id, currency="INR")
        db.add(grp)
        db.flush()
        db.add_all([
            GroupMember(group_id=grp.id, user_id=user.id, display_name="Nishant", role="admin"),
            GroupMember(group_id=grp.id, display_name="Aarav", role="member"),
            GroupMember(group_id=grp.id, display_name="Rohan", role="member"),
            GroupMember(group_id=grp.id, display_name="Priya", role="member"),
        ])
        db.commit()
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_demo_data()
    yield

app = FastAPI(title="PocketPilot API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
