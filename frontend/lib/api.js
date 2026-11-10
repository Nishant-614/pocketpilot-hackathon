const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export async function fetchMe() {
  const res = await fetch(`${API_BASE}/me`);
  if (!res.ok) throw new Error("Failed to fetch user profile");
  return res.json();
}

export async function fetchSummary(currency = "INR") {
  const res = await fetch(`${API_BASE}/analytics/summary?currency=${currency}`);
  if (!res.ok) throw new Error("Failed to fetch analytics summary");
  return res.json();
}

export async function fetchTransactions(category = "", currency = "") {
  const params = new URLSearchParams();
  if (category) params.append("category", category);
  if (currency) params.append("currency", currency);
  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE}/transactions${query}`);
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
}

export async function searchTransactions(q) {
  const res = await fetch(`${API_BASE}/transactions/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Failed to search transactions");
  return res.json();
}

export async function fetchGroups() {
  const res = await fetch(`${API_BASE}/groups`);
  if (!res.ok) throw new Error("Failed to fetch groups");
  return res.json();
}

export async function createGroup(payload) {
  const res = await fetch(`${API_BASE}/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to create group");
  return res.json();
}

export async function fetchGroupBalances(groupId) {
  const res = await fetch(`${API_BASE}/groups/${groupId}/balances`);
  if (!res.ok) throw new Error("Failed to fetch group balances");
  return res.json();
}

export async function addGroupMember(groupId, displayName) {
  const res = await fetch(`${API_BASE}/groups/${groupId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: displayName, role: "member" }),
  });
  if (!res.ok) throw new Error("Failed to add member");
  return res.json();
}

export async function createGroupExpense(groupId, payload) {
  const res = await fetch(`${API_BASE}/groups/${groupId}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create group expense");
  }
  return res.json();
}

export async function createPayPalOrder(payload) {
  const res = await fetch(`${API_BASE}/payments/create-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create PayPal Sandbox order");
  }
  return res.json();
}

export async function capturePayPalOrder(providerOrderId) {
  const res = await fetch(`${API_BASE}/payments/capture-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider_order_id: providerOrderId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to capture PayPal Sandbox order");
  }
  return res.json();
}

export async function fetchPayments() {
  const res = await fetch(`${API_BASE}/payments`);
  if (!res.ok) throw new Error("Failed to fetch payments");
  return res.json();
}

export async function fetchSubscriptions() {
  const res = await fetch(`${API_BASE}/subscriptions`);
  if (!res.ok) throw new Error("Failed to fetch subscriptions");
  return res.json();
}

export async function sendChatMessage(message) {
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error("Failed to reach AI Copilot");
  return res.json();
}
