from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

def utc_now():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    source = Column(String(32), nullable=False, default="demo")  # sandbox, imported, demo
    external_id = Column(String(128), nullable=True, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False)
    merchant = Column(String(160), nullable=False)
    category = Column(String(64), nullable=False, index=True)
    occurred_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    status = Column(String(32), nullable=False, default="COMPLETED")

class Budget(Base):
    __tablename__ = "budgets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String(64), nullable=False)
    limit_amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    period = Column(String(32), nullable=False, default="MONTHLY")

class Group(Base):
    __tablename__ = "groups"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    currency = Column(String(3), nullable=False, default="INR")
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    expenses = relationship("Expense", back_populates="group", cascade="all, delete-orphan")

class GroupMember(Base):
    __tablename__ = "group_members"
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    display_name = Column(String(120), nullable=False)
    role = Column(String(32), nullable=False, default="member")
    group = relationship("Group", back_populates="members")

class Expense(Base):
    __tablename__ = "expenses"
    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)
    payer_member_id = Column(Integer, ForeignKey("group_members.id"), nullable=False)
    description = Column(String(255), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False)
    occurred_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    group = relationship("Group", back_populates="expenses")
    splits = relationship("ExpenseSplit", back_populates="expense", cascade="all, delete-orphan")

class ExpenseSplit(Base):
    __tablename__ = "expense_splits"
    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(Integer, ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    member_id = Column(Integer, ForeignKey("group_members.id", ondelete="CASCADE"), nullable=False)
    share_amount = Column(Numeric(12, 2), nullable=False)
    paid_amount = Column(Numeric(12, 2), nullable=False, default=Decimal("0.00"))
    expense = relationship("Expense", back_populates="splits")

class Subscription(Base):
    __tablename__ = "subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    merchant = Column(String(160), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False)
    cadence = Column(String(32), nullable=False, default="MONTHLY")
    next_renewal = Column(DateTime(timezone=True), nullable=True)
    confirmed = Column(Boolean, default=False, nullable=False)

class PaymentEvent(Base):
    __tablename__ = "payment_events"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(32), nullable=False, default="PAYPAL_SANDBOX")
    provider_order_id = Column(String(128), unique=True, index=True, nullable=False)
    provider_capture_id = Column(String(128), unique=True, index=True, nullable=True)
    merchant_name = Column(String(160), nullable=False)
    status = Column(String(32), nullable=False)  # CREATED, APPROVED, COMPLETED, FAILED
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    id = Column(Integer, primary_key=True, index=True)
    provider_event_id = Column(String(128), unique=True, index=True, nullable=False)
    event_type = Column(String(128), nullable=False)
    received_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    verified = Column(Boolean, default=False, nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    payload_summary = Column(Text, nullable=True)
