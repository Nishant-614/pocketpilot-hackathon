from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Tuple

def to_minor_units(amount: Decimal) -> int:
    return int((amount * Decimal("100")).to_integral_value(rounding=ROUND_HALF_UP))

def from_minor_units(minor: int) -> Decimal:
    return (Decimal(minor) / Decimal("100")).quantize(Decimal("0.01"))

def calculate_equal_splits(total_amount: Decimal, member_ids: List[int]) -> Dict[int, Decimal]:
    if not member_ids:
        raise ValueError("At least one group member is required.")
    ordered_ids = sorted(member_ids)
    total_minor = to_minor_units(total_amount)
    n = len(ordered_ids)
    base_share, remainder = divmod(total_minor, n)

    splits: Dict[int, Decimal] = {}
    for idx, m_id in enumerate(ordered_ids):
        share_minor = base_share + (1 if idx < remainder else 0)
        splits[m_id] = from_minor_units(share_minor)
    return splits

def compute_net_balances_and_settlements(
    members: Dict[int, str],
    paid_by_member: Dict[int, Decimal],
    owed_by_member: Dict[int, Decimal],
    currency: str
) -> Tuple[List[dict], List[dict]]:
    net_minor: Dict[int, int] = {}
    for m_id in sorted(members.keys()):
        paid_m = to_minor_units(paid_by_member.get(m_id, Decimal("0.00")))
        owed_m = to_minor_units(owed_by_member.get(m_id, Decimal("0.00")))
        net_minor[m_id] = paid_m - owed_m

    balances = [
        {
            "member_id": m_id,
            "display_name": members[m_id],
            "net_balance": str(from_minor_units(net_minor[m_id])),
            "currency": currency,
        }
        for m_id in sorted(members.keys())
    ]

    debtors = [[m_id, -bal] for m_id, bal in net_minor.items() if bal < 0]
    creditors = [[m_id, bal] for m_id, bal in net_minor.items() if bal > 0]
    debtors.sort(key=lambda x: (-x[1], x[0]))
    creditors.sort(key=lambda x: (-x[1], x[0]))

    settlements = []
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        debtor_id, debt_amt = debtors[i]
        creditor_id, cred_amt = creditors[j]
        transfer_minor = min(debt_amt, cred_amt)

        if transfer_minor > 0:
            settlements.append({
                "from_member_id": debtor_id,
                "from_name": members[debtor_id],
                "to_member_id": creditor_id,
                "to_name": members[creditor_id],
                "amount": str(from_minor_units(transfer_minor)),
                "currency": currency,
                "note": "Internal ledger recommendation only; not an automatic transfer."
            })

        debtors[i][1] -= transfer_minor
        creditors[j][1] -= transfer_minor
        if debtors[i][1] == 0:
            i += 1
        if creditors[j][1] == 0:
            j += 1

    return balances, settlements
