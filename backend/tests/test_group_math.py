from decimal import Decimal
from app.services.group_service import calculate_equal_splits, compute_net_balances_and_settlements

def test_equal_split_remainder_distribution():
    splits = calculate_equal_splits(Decimal("100.00"), [1, 2, 3])
    assert sum(splits.values()) == Decimal("100.00")
    assert splits[1] == Decimal("33.34")
    assert splits[2] == Decimal("33.33")
    assert splits[3] == Decimal("33.33")

def test_settlement_balances_net_to_zero():
    members = {1: "Nishant", 2: "Aarav", 3: "Rohan"}
    paid = {1: Decimal("300.00"), 2: Decimal("0.00"), 3: Decimal("0.00")}
    owed = {1: Decimal("100.00"), 2: Decimal("100.00"), 3: Decimal("100.00")}
    balances, settlements = compute_net_balances_and_settlements(members, paid, owed, "INR")
    total_net = sum(Decimal(b["net_balance"]) for b in balances)
    assert total_net == Decimal("0.00")
    assert len(settlements) == 2
