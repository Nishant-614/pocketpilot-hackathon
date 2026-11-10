# PocketPilot Technical Architecture

## Core Principles
1. The frontend never stores PayPal client secrets or server credentials.
2. The backend is authoritative for user identity, balances, splits, payment amounts, and payment state.
3. The AI model can request approved tools, but cannot bypass backend validation.
4. Read operations and money-moving operations are strictly separated.
5. Every payment action requires a clear user review/approval step.
6. Webhook signatures and events are verified idempotently.
7. Group expenses use an internal accounting ledger and are never misrepresented as regulated wallet transfers.
