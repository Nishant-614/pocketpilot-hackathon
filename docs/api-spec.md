# PocketPilot Complete API Specification

- `POST /auth/register` - Create application account
- `POST /auth/login` - Authenticate and issue token
- `GET /me` - Return authenticated user's profile
- `GET /transactions` - List transactions with pagination and filters
- `GET /transactions/search?q=...` - Search user's transactions
- `GET /analytics/summary` - Return totals, category breakdown, and period comparison
- `GET /groups` - List user's active expense groups
- `POST /groups` - Create an expense group
- `POST /groups/{group_id}/members` - Add group member
- `POST /groups/{group_id}/expenses` - Create expense and deterministic split rows
- `GET /groups/{group_id}/balances` - Return net balances and settlement suggestions
- `GET /payments` - List payment audit logs
- `GET /payments/{payment_id}` - Get individual payment event detail
- `POST /payments/create-order` - Create a supported PayPal Sandbox order
- `POST /payments/capture-order` - Capture an approved order and verify result
- `POST /payments/webhook` - Receive and verify PayPal webhook events idempotently
- `GET /subscriptions` - List user's confirmed and suggested recurring items
- `POST /ai/chat` - Send natural-language query to AI Copilot tool orchestrator
