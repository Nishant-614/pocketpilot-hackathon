from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field

class GroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    initial_members: List[str] = Field(default_factory=list)

class MemberCreateRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=120)
    role: str = Field(default="member")

class ExpenseCreateRequest(BaseModel):
    payer_member_id: int
    description: str = Field(..., min_length=1, max_length=255)
    amount: Decimal = Field(..., gt=Decimal("0.00"))
    currency: str = Field(default="INR", min_length=3, max_length=3)
    participant_member_ids: Optional[List[int]] = None

class CreateOrderRequest(BaseModel):
    merchant_name: str = Field(..., min_length=1, max_length=160)
    amount: Decimal = Field(..., gt=Decimal("0.00"))
    currency: str = Field(default="USD", min_length=3, max_length=3)
    description: str = Field(default="PocketPilot Sandbox Checkout")
    user_confirmed: bool = Field(..., description="Must be True after explicit user review")

class CaptureOrderRequest(BaseModel):
    provider_order_id: str = Field(..., min_length=3)

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
