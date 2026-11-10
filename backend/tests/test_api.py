import pytest
from fastapi.testclient import TestClient
from app.main import app, seed_demo_data

# Ensure database tables and seeded demo data exist before any tests run
seed_demo_data()

@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c

def test_read_me(client):
    res = client.get("/me")
    assert res.status_code == 200
    data = res.json()
    assert "name" in data
    assert "email" in data

def test_analytics_summary_seeded(client):
    res = client.get("/analytics/summary?currency=INR")
    assert res.status_code == 200
    data = res.json()
    assert data["currency"] == "INR"
    assert float(data["total_completed_spend"]) >= 1350.00

def test_ai_spending_query(client):
    res = client.post("/ai/chat", json={"message": "How much did I spend on food last month?"})
    assert res.status_code == 200
    data = res.json()
    assert "food" in data["reply"].lower()
    assert "1350.00" in data["reply"]

def test_ai_payment_guardrail(client):
    res = client.post("/ai/chat", json={"message": "Pay CloudHost 25"})
    assert res.status_code == 200
    data = res.json()
    assert data["tool_output"]["action"] == "REVIEW_REQUIRED"
    assert data["tool_output"]["requires_user_confirmation"] is True
    assert data["tool_output"]["proposed_order"]["amount"] == "25.00"

def test_paypal_order_lifecycle(client):
    create_res = client.post("/payments/create-order", json={
        "merchant_name": "Test Merchant",
        "amount": "15.00",
        "currency": "USD",
        "description": "Test checkout",
        "user_confirmed": True
    })
    assert create_res.status_code == 200
    order = create_res.json()
    order_id = order["provider_order_id"]
    assert order["status"] == "CREATED"

    cap_res = client.post("/payments/capture-order", json={
        "provider_order_id": order_id
    })
    assert cap_res.status_code == 200
    captured = cap_res.json()
    assert captured["status"] == "COMPLETED"
    assert captured["provider_capture_id"] is not None
