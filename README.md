# PocketPilot - AI-Powered Personal Finance Companion

PocketPilot is a consumer-focused financial companion that helps individuals understand spending, manage shared expenses, monitor recurring costs, and take supported PayPal Sandbox payment actions with explicit user approval.

## Architecture Highlights
- **Backend (`backend/`)**: Python FastAPI + SQLAlchemy (SQLite zero-config fallback / PostgreSQL) + httpx for PayPal Sandbox REST APIs.
- **AI Copilot (`backend/app/ai/`)**: Tool-calling orchestrator supporting OpenAI-compatible LLMs (GPT-4o, Groq, Gemini) with an offline rule-based fallback when keys are absent. Read-only queries execute safely; payments trigger explicit user review.
- **Group Settlement Engine (`backend/app/services/group_service.py`)**: Deterministic integer minor-unit (paise/cents) arithmetic and minimum-transfer settlement optimization.
- **PayPal Integration (`backend/app/services/paypal_service.py`)**: Server-side OAuth 2.0 token generation, Orders v2 creation/capture, and webhook signature verification with local mock fallback.
- **Frontend (`frontend/`)**: Full 6-tab Next.js responsive dashboard covering Home, Payments & Checkout, Groups & Splits, Spending Insights, Subscriptions, and AI Copilot.

## Quick Start (Backend)

1. Create and activate a Python virtual environment:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install --upgrade pip
   pip install -r requirements.txt
   ```
2. Run automated verification tests:
   ```bash
   PYTHONPATH=. pytest -v
   ```
3. Start the FastAPI server on port 8000:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
4. Check interactive documentation at `http://localhost:8000/docs`.

## Quick Start (Frontend)

1. In a second terminal pane:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open `http://localhost:3000` in your browser.
