"use client";
import React, { useState, useEffect, useCallback } from "react";
import {
  fetchMe,
  fetchSummary,
  fetchTransactions,
  searchTransactions,
  fetchGroups,
  createGroup,
  fetchGroupBalances,
  addGroupMember,
  createGroupExpense,
  createPayPalOrder,
  capturePayPalOrder,
  fetchPayments,
  fetchSubscriptions,
  sendChatMessage,
} from "../lib/api";

const TABS = [
  { id: "home", label: "Home" },
  { id: "payments", label: "Payments & Checkout" },
  { id: "groups", label: "Groups & Splits" },
  { id: "insights", label: "Insights" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "copilot", label: "AI Copilot" },
];

export default function PocketPilotApp() {
  const [activeTab, setActiveTab] = useState("home");
  const [user, setUser] = useState(null);
  const [summaryINR, setSummaryINR] = useState(null);
  const [summaryUSD, setSummaryUSD] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(1);
  const [groupDetail, setGroupDetail] = useState(null);
  const [newExpenseDesc, setNewExpenseDesc] = useState("");
  const [newExpenseAmount, setNewExpenseAmount] = useState("");
  const [newExpensePayer, setNewExpensePayer] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCurrency, setNewGroupCurrency] = useState("INR");
  const [newGroupMembers, setNewGroupMembers] = useState("");

  const [payments, setPayments] = useState([]);
  const [checkoutMerchant, setCheckoutMerchant] = useState("CloudHost Pro");
  const [checkoutAmount, setCheckoutAmount] = useState("25.00");
  const [checkoutCurrency, setCheckoutCurrency] = useState("USD");
  const [checkoutDescription, setCheckoutDescription] = useState("Annual developer sandbox plan");
  const [pendingOrder, setPendingOrder] = useState(null);
  const [activePayPalOrder, setActivePayPalOrder] = useState(null);
  const [paymentStatusMsg, setPaymentStatusMsg] = useState("");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [subscriptions, setSubscriptions] = useState([]);

  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Welcome to PocketPilot! Ask me 'How much did I spend on food last month?', 'Split 3000 equally among 4 people', or 'Pay CloudHost 25'.",
      tool: null,
    },
  ]);

  const [errorBanner, setErrorBanner] = useState("");

  const loadDashboardData = useCallback(async () => {
    try {
      setErrorBanner("");
      const [meData, sumInr, sumUsd, txData, subData, payData, grpList] = await Promise.all([
        fetchMe(),
        fetchSummary("INR"),
        fetchSummary("USD"),
        fetchTransactions(),
        fetchSubscriptions(),
        fetchPayments(),
        fetchGroups(),
      ]);
      setUser(meData);
      setSummaryINR(sumInr);
      setSummaryUSD(sumUsd);
      setTransactions(txData);
      setSubscriptions(subData);
      setPayments(payData);
      setGroups(grpList);
    } catch (err) {
      setErrorBanner("Cannot reach FastAPI backend at http://localhost:8000. Ensure Uvicorn is running.");
    }
  }, []);

  const loadGroupData = useCallback(async (groupId) => {
    if (!groupId) return;
    try {
      const detail = await fetchGroupBalances(groupId);
      setGroupDetail(detail);
      if (detail.balances && detail.balances.length > 0) {
        setNewExpensePayer(String(detail.balances[0].member_id));
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    loadGroupData(selectedGroupId);
  }, [selectedGroupId, loadGroupData]);

  async function handleTransactionSearch(e) {
    e.preventDefault();
    try {
      if (!searchQuery.trim()) {
        const tx = await fetchTransactions(categoryFilter, "");
        setTransactions(tx);
      } else {
        const tx = await searchTransactions(searchQuery.trim());
        setTransactions(tx);
      }
    } catch (err) {
      setErrorBanner(err.message);
    }
  }

  async function handleCategoryFilterChange(cat) {
    setCategoryFilter(cat);
    setSearchQuery("");
    try {
      const tx = await fetchTransactions(cat, "");
      setTransactions(tx);
    } catch (err) {
      setErrorBanner(err.message);
    }
  }

  async function handleAddExpense(e) {
    e.preventDefault();
    if (!newExpenseDesc.trim() || !newExpenseAmount || !newExpensePayer) return;
    try {
      await createGroupExpense(selectedGroupId, {
        payer_member_id: Number(newExpensePayer),
        description: newExpenseDesc.trim(),
        amount: String(newExpenseAmount),
        currency: groupDetail?.currency || "INR",
      });
      setNewExpenseDesc("");
      setNewExpenseAmount("");
      await loadGroupData(selectedGroupId);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleAddMember(e) {
    e.preventDefault();
    if (!newMemberName.trim()) return;
    try {
      await addGroupMember(selectedGroupId, newMemberName.trim());
      setNewMemberName("");
      await loadGroupData(selectedGroupId);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const membersArr = newGroupMembers
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const created = await createGroup({
        name: newGroupName.trim(),
        currency: newGroupCurrency,
        initial_members: membersArr,
      });
      setNewGroupName("");
      setNewGroupMembers("");
      const updatedGroups = await fetchGroups();
      setGroups(updatedGroups);
      setSelectedGroupId(created.id);
    } catch (err) {
      alert(err.message);
    }
  }

  function initiateCheckoutReview(e) {
    e.preventDefault();
    setPaymentStatusMsg("");
    setPendingOrder({
      merchant: checkoutMerchant,
      amount: Number(checkoutAmount).toFixed(2),
      currency: checkoutCurrency,
      description: checkoutDescription,
      provider: "PayPal Sandbox Checkout (Orders v2)",
    });
  }

  async function handleConfirmAndCreateOrder() {
    if (!pendingOrder) return;
    setIsProcessingPayment(true);
    setPaymentStatusMsg("");
    try {
      const created = await createPayPalOrder({
        merchant_name: pendingOrder.merchant,
        amount: pendingOrder.amount,
        currency: pendingOrder.currency,
        description: pendingOrder.description || `Checkout payment to ${pendingOrder.merchant}`,
        user_confirmed: true,
      });
      setActivePayPalOrder({
        ...created,
        merchant_name: pendingOrder.merchant,
        amount: pendingOrder.amount,
        currency: pendingOrder.currency,
      });
      setPendingOrder(null);
      setPaymentStatusMsg(
        `Order ${created.provider_order_id} created in PayPal Sandbox. Approve with buyer account and click Capture below.`
      );
      await loadDashboardData();
    } catch (err) {
      setPaymentStatusMsg(`Error creating order: ${err.message}`);
    } finally {
      setIsProcessingPayment(false);
    }
  }

  async function handleCaptureOrder(providerOrderId) {
    setIsProcessingPayment(true);
    try {
      const captured = await capturePayPalOrder(providerOrderId);
      setActivePayPalOrder((prev) =>
        prev && prev.provider_order_id === providerOrderId ? { ...prev, ...captured } : prev
      );
      setPaymentStatusMsg(
        `Verified! Order ${captured.provider_order_id} captured (Capture ID: ${
          captured.provider_capture_id || "VERIFIED"
        }) with status ${captured.status}. Recorded in transaction ledger.`
      );
      await loadDashboardData();
    } catch (err) {
      setPaymentStatusMsg(`Error capturing order: ${err.message}`);
    } finally {
      setIsProcessingPayment(false);
    }
  }

  async function handleSendChat(e, presetPrompt = null) {
    if (e) e.preventDefault();
    const textToSend = presetPrompt !== null ? presetPrompt : chatInput;
    if (!textToSend.trim()) return;

    setMessages((prev) => [...prev, { role: "user", text: textToSend, tool: null }]);
    if (presetPrompt === null) setChatInput("");

    try {
      const data = await sendChatMessage(textToSend);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.reply,
          tool: data.tool_output?.tool || null,
        },
      ]);
      if (data.tool_output?.action === "REVIEW_REQUIRED") {
        setPendingOrder(data.tool_output.proposed_order);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Error contacting backend AI orchestrator.", tool: null },
      ]);
    }
  }

  return (
    <div style={{ minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header
        style={{
          background: "#003087",
          color: "#ffffff",
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>PocketPilot</h1>
            <span
              style={{
                background: "#0070ba",
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 999,
                fontWeight: 600,
              }}
            >
              SANDBOX / DEMO DATA
            </span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#cbd5e1" }}>
            AI Personal Finance Companion &bull; PayPal Orders v2 &bull; Deterministic Group Ledger
          </p>
        </div>
        <div style={{ textAlign: "right", fontSize: 13 }}>
          <div style={{ fontWeight: 600 }}>{user ? user.name : "Loading user..."}</div>
          <div style={{ color: "#93c5fd" }}>{user ? user.email : ""}</div>
        </div>
      </header>

      <nav
        style={{
          background: "#ffffff",
          borderBottom: "1px solid #e2e8f0",
          padding: "0 24px",
          display: "flex",
          gap: 8,
          overflowX: "auto",
        }}
      >
        {TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "14px 16px",
                border: "none",
                borderBottom: isActive ? "3px solid #0070ba" : "3px solid transparent",
                background: "transparent",
                color: isActive ? "#003087" : "#475569",
                fontWeight: isActive ? 700 : 500,
                fontSize: 14,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: 24 }}>
        {errorBanner && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #f87171",
              color: "#991b1b",
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            {errorBanner}
          </div>
        )}

        {pendingOrder && (
          <section
            style={{
              border: "2px solid #f59e0b",
              background: "#fffbeb",
              padding: 20,
              borderRadius: 10,
              marginBottom: 24,
              boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, color: "#92400e" }}>
                Step 1: Explicit User Review Required Before Creating PayPal Order
              </h3>
              <span
                style={{
                  background: "#fef3c7",
                  color: "#b45309",
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 4,
                  fontWeight: 600,
                }}
              >
                GUARDRAIL ACTIVE
              </span>
            </div>
            <p style={{ margin: "10px 0", fontSize: 14, color: "#78350f" }}>
              PocketPilot never executes payments silently. Review the merchant, currency, and amount below to create a PayPal Sandbox checkout order:
            </p>
            <div
              style={{
                background: "#ffffff",
                padding: 12,
                borderRadius: 6,
                border: "1px solid #fde68a",
                marginBottom: 14,
                fontSize: 14,
              }}
            >
              <div><strong>Merchant:</strong> {pendingOrder.merchant}</div>
              <div><strong>Amount:</strong> {pendingOrder.currency} {pendingOrder.amount}</div>
              <div><strong>Description:</strong> {pendingOrder.description}</div>
              <div><strong>Route:</strong> {pendingOrder.provider}</div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                disabled={isProcessingPayment}
                onClick={handleConfirmAndCreateOrder}
                style={{
                  padding: "10px 18px",
                  background: "#003087",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {isProcessingPayment ? "Creating Sandbox Order..." : "Confirm & Create PayPal Sandbox Order"}
              </button>
              <button
                onClick={() => setPendingOrder(null)}
                style={{
                  padding: "10px 16px",
                  background: "#e2e8f0",
                  color: "#1e293b",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        {activePayPalOrder && (
          <section
            style={{
              border: "2px solid #0070ba",
              background: "#f0f9ff",
              padding: 20,
              borderRadius: 10,
              marginBottom: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, color: "#0c4a6e" }}>
                PayPal Sandbox Order Lifecycle: {activePayPalOrder.provider_order_id}
              </h3>
              <span
                style={{
                  background: activePayPalOrder.status === "COMPLETED" ? "#dcfce7" : "#dbeafe",
                  color: activePayPalOrder.status === "COMPLETED" ? "#166534" : "#1e40af",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {activePayPalOrder.status}
              </span>
            </div>
            <p style={{ fontSize: 14, color: "#0369a1", margin: "8px 0 14px" }}>
              {paymentStatusMsg}
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              {activePayPalOrder.approve_url && activePayPalOrder.status !== "COMPLETED" && (
                <a
                  href={activePayPalOrder.approve_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: "10px 16px",
                    background: "#ffc439",
                    color: "#111827",
                    textDecoration: "none",
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  Step 2: Open PayPal Sandbox Buyer Approval &#8599;
                </a>
              )}
              {activePayPalOrder.status !== "COMPLETED" && (
                <button
                  disabled={isProcessingPayment}
                  onClick={() => handleCaptureOrder(activePayPalOrder.provider_order_id)}
                  style={{
                    padding: "10px 16px",
                    background: "#0070ba",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 6,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {isProcessingPayment ? "Capturing..." : "Step 3: Verify & Capture Order"}
                </button>
              )}
              <button
                onClick={() => setActivePayPalOrder(null)}
                style={{
                  padding: "8px 12px",
                  background: "transparent",
                  border: "1px solid #94a3b8",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Dismiss
              </button>
            </div>
          </section>
        )}

        {activeTab === "home" && (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 16,
                marginBottom: 24,
              }}
            >
              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: "#64748b" }}>Completed Spend (INR)</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
                  INR {summaryINR ? summaryINR.total_completed_spend : "0.00"}
                </div>
                <div style={{ fontSize: 12, color: "#0f766e", marginTop: 6 }}>
                  {summaryINR ? `${summaryINR.transaction_count} completed transactions (demo seeded)` : ""}
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: "#64748b" }}>Completed Spend (USD Sandbox)</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>
                  USD {summaryUSD ? summaryUSD.total_completed_spend : "0.00"}
                </div>
                <div style={{ fontSize: 12, color: "#0369a1", marginTop: 6 }}>
                  Includes PayPal Sandbox checkouts & subscriptions
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: "#64748b" }}>Active Expense Groups</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6 }}>{groups.length}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                  Internal minor-unit split ledger
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 13, color: "#64748b" }}>Quick Actions</div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setActiveTab("copilot")} style={primaryBtnStyle}>
                    Ask AI Copilot
                  </button>
                  <button onClick={() => setActiveTab("payments")} style={secondaryBtnStyle}>
                    PayPal Checkout
                  </button>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Recent Transactions</h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                      <th style={{ padding: "8px 6px" }}>Merchant</th>
                      <th style={{ padding: "8px 6px" }}>Category</th>
                      <th style={{ padding: "8px 6px" }}>Source</th>
                      <th style={{ padding: "8px 6px", textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 6).map((t) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 6px", fontWeight: 500 }}>{t.merchant}</td>
                        <td style={{ padding: "10px 6px" }}>
                          <span style={badgeStyle}>{t.category}</span>
                        </td>
                        <td style={{ padding: "10px 6px", fontSize: 12, color: "#64748b" }}>
                          {t.source.toUpperCase()}
                        </td>
                        <td style={{ padding: "10px 6px", textAlign: "right", fontWeight: 600 }}>
                          {t.currency} {t.amount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Security & Regional Guardrails</h3>
                <ul style={{ paddingLeft: 18, fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
                  <li>
                    <strong>Explicit Confirmation:</strong> AI Copilot cannot capture or move funds without user approval.
                  </li>
                  <li>
                    <strong>Merchant Checkout Scope:</strong> Uses PayPal Orders v2 in USD Sandbox mode (domestic INR P2P is not claimed).
                  </li>
                  <li>
                    <strong>Internal Split Ledger:</strong> Group balances are accounting records calculated in integer minor units.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === "payments" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 24 }}>
            <div style={cardStyle}>
              <h2 style={{ marginTop: 0, fontSize: 20 }}>Create Supported PayPal Sandbox Checkout</h2>
              <p style={{ fontSize: 13, color: "#475569" }}>
                Demonstrates a supported merchant checkout flow using server-side PayPal Orders v2 API credentials.
              </p>
              <form onSubmit={initiateCheckoutReview} style={{ display: "grid", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Merchant / Service Name</label>
                  <input
                    value={checkoutMerchant}
                    onChange={(e) => setCheckoutMerchant(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={checkoutAmount}
                      onChange={(e) => setCheckoutAmount(e.target.value)}
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Currency</label>
                    <select
                      value={checkoutCurrency}
                      onChange={(e) => setCheckoutCurrency(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="USD">USD (PayPal Sandbox)</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Order Description</label>
                  <input
                    value={checkoutDescription}
                    onChange={(e) => setCheckoutDescription(e.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
                <button type="submit" style={primaryBtnStyle}>
                  Review & Prepare PayPal Order
                </button>
              </form>

              <hr style={{ margin: "24px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />

              <h3 style={{ fontSize: 16 }}>PayPal Order & Capture Audit Log</h3>
              {payments.length === 0 ? (
                <p style={{ fontSize: 13, color: "#64748b" }}>
                  No PayPal Sandbox orders created yet in this session.
                </p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {payments.map((p) => (
                    <div
                      key={p.payment_id}
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: 8,
                        padding: 12,
                        fontSize: 13,
                        background: "#f8fafc",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                        <span>{p.merchant_name} ({p.currency} {p.amount})</span>
                        <span
                          style={{
                            color: p.status === "COMPLETED" ? "#15803d" : "#b45309",
                          }}
                        >
                          {p.status}
                        </span>
                      </div>
                      <div style={{ color: "#475569", marginTop: 4 }}>
                        Order ID: <code>{p.provider_order_id}</code>
                      </div>
                      {p.provider_capture_id && (
                        <div style={{ color: "#15803d", marginTop: 2 }}>
                          Verified Capture ID: <code>{p.provider_capture_id}</code>
                        </div>
                      )}
                      {p.status !== "COMPLETED" && (
                        <button
                          onClick={() => handleCaptureOrder(p.provider_order_id)}
                          style={{ ...secondaryBtnStyle, marginTop: 8, padding: "6px 10px", fontSize: 12 }}
                        >
                          Capture Order Now
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h2 style={{ marginTop: 0, fontSize: 20 }}>Transaction Explorer & Search</h2>
              <form
                onSubmit={handleTransactionSearch}
                style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}
              >
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by merchant or category (e.g., Zomato, food, sandbox)..."
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button type="submit" style={primaryBtnStyle}>
                  Search
                </button>
              </form>

              <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                {["", "food", "travel", "subscriptions", "payments"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleCategoryFilterChange(cat)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 999,
                      border: "1px solid #cbd5e1",
                      background: categoryFilter === cat ? "#003087" : "#ffffff",
                      color: categoryFilter === cat ? "#ffffff" : "#334155",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {cat === "" ? "All Categories" : cat.toUpperCase()}
                  </button>
                ))}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                    <th style={{ padding: 8 }}>Merchant</th>
                    <th style={{ padding: 8 }}>Category</th>
                    <th style={{ padding: 8 }}>Source</th>
                    <th style={{ padding: 8 }}>Status</th>
                    <th style={{ padding: 8, textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 8, fontWeight: 600 }}>{t.merchant}</td>
                      <td style={{ padding: 8 }}>{t.category}</td>
                      <td style={{ padding: 8 }}>
                        <span
                          style={{
                            ...badgeStyle,
                            background: t.source === "sandbox" ? "#dcfce7" : "#f1f5f9",
                            color: t.source === "sandbox" ? "#166534" : "#475569",
                          }}
                        >
                          {t.source}
                        </span>
                      </td>
                      <td style={{ padding: 8 }}>{t.status}</td>
                      <td style={{ padding: 8, textAlign: "right", fontWeight: 700 }}>
                        {t.currency} {t.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "groups" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 24 }}>
            <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Select Expense Group</h3>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(Number(e.target.value))}
                  style={{ ...inputStyle, marginBottom: 14 }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.currency})
                    </option>
                  ))}
                </select>

                <h4 style={{ margin: "12px 0 8px", fontSize: 14 }}>Add Member to Current Group</h4>
                <form onSubmit={handleAddMember} style={{ display: "flex", gap: 8 }}>
                  <input
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Member name (e.g., Sneha)"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button type="submit" style={secondaryBtnStyle}>
                    + Add
                  </button>
                </form>
              </div>

              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Record Shared Group Expense</h3>
                <form onSubmit={handleAddExpense} style={{ display: "grid", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Expense Description</label>
                    <input
                      value={newExpenseDesc}
                      onChange={(e) => setNewExpenseDesc(e.target.value)}
                      placeholder="e.g., Cab to Dawki River"
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>
                      Total Amount ({groupDetail?.currency || "INR"})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={newExpenseAmount}
                      onChange={(e) => setNewExpenseAmount(e.target.value)}
                      placeholder="e.g., 100.00"
                      style={inputStyle}
                      required
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Paid By</label>
                    <select
                      value={newExpensePayer}
                      onChange={(e) => setNewExpensePayer(e.target.value)}
                      style={inputStyle}
                    >
                      {groupDetail?.balances?.map((b) => (
                        <option key={b.member_id} value={b.member_id}>
                          {b.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" style={primaryBtnStyle}>
                    Split Equally & Update Balances
                  </button>
                </form>
              </div>

              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Create New Group</h3>
                <form onSubmit={handleCreateGroup} style={{ display: "grid", gap: 10 }}>
                  <input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Group Name (e.g., Hostel Flatmates)"
                    style={inputStyle}
                    required
                  />
                  <input
                    value={newGroupMembers}
                    onChange={(e) => setNewGroupMembers(e.target.value)}
                    placeholder="Members comma-separated (e.g., Aman, Vikram)"
                    style={inputStyle}
                  />
                  <button type="submit" style={secondaryBtnStyle}>
                    Create Group
                  </button>
                </form>
              </div>
            </div>

            <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
              <div style={cardStyle}>
                <h2 style={{ marginTop: 0, fontSize: 20 }}>
                  {groupDetail ? `${groupDetail.group_name} — Net Balances` : "Group Balances"}
                </h2>
                <p style={{ fontSize: 13, color: "#64748b" }}>
                  Calculated in integer minor units (paise/cents) so splits always reconcile to zero.
                </p>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                      <th style={{ padding: 8 }}>Participant</th>
                      <th style={{ padding: 8, textAlign: "right" }}>Net Balance</th>
                      <th style={{ padding: 8 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupDetail?.balances?.map((b) => {
                      const val = parseFloat(b.net_balance);
                      return (
                        <tr key={b.member_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8, fontWeight: 600 }}>{b.display_name}</td>
                          <td
                            style={{
                              padding: 8,
                              textAlign: "right",
                              fontWeight: 700,
                              color: val > 0 ? "#15803d" : val < 0 ? "#b91c1c" : "#475569",
                            }}
                          >
                            {val > 0 ? `+${b.net_balance}` : b.net_balance} {b.currency}
                          </td>
                          <td style={{ padding: 8, fontSize: 13 }}>
                            {val > 0 ? "Gets back" : val < 0 ? "Owes group" : "Settled"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={cardStyle}>
                <h3 style={{ marginTop: 0 }}>Suggested Minimum-Transfer Settlement Plan</h3>
                {!groupDetail?.settlement_suggestions ||
                groupDetail.settlement_suggestions.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#64748b" }}>
                    All members are settled! Add an expense on the left to compute transfers.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {groupDetail.settlement_suggestions.map((s, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          background: "#f0fdf4",
                          border: "1px solid #bbf7d0",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <strong>{s.from_name}</strong> pays <strong>{s.to_name}</strong>{" "}
                          <span style={{ fontWeight: 700, color: "#166534" }}>
                            {s.currency} {s.amount}
                          </span>
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.note}</div>
                        </div>
                        <button
                          onClick={() => {
                            setPendingOrder({
                              merchant: `${groupDetail.group_name} Settlement (${s.to_name})`,
                              amount: s.amount,
                              currency: "USD",
                              description: `Group settlement from ${s.from_name} to ${s.to_name}`,
                              provider: "PayPal Sandbox Checkout (Orders v2)",
                            });
                          }}
                          style={{ ...secondaryBtnStyle, fontSize: 12, padding: "6px 10px" }}
                        >
                          Test Sandbox Checkout
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "insights" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div style={cardStyle}>
              <h2 style={{ marginTop: 0, fontSize: 20 }}>Category Breakdown (INR Completed Spend)</h2>
              {summaryINR && summaryINR.by_category ? (
                <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                  {Object.entries(summaryINR.by_category).map(([cat, amt]) => {
                    const total = parseFloat(summaryINR.total_completed_spend) || 1;
                    const pct = Math.min(100, Math.round((parseFloat(amt) / total) * 100));
                    return (
                      <div key={cat}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 14,
                            fontWeight: 600,
                            marginBottom: 4,
                          }}
                        >
                          <span style={{ textTransform: "capitalize" }}>{cat}</span>
                          <span>
                            INR {amt} ({pct}%)
                          </span>
                        </div>
                        <div
                          style={{
                            height: 10,
                            background: "#e2e8f0",
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              background: "#0070ba",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>No completed INR spend data available.</p>
              )}
            </div>

            <div style={cardStyle}>
              <h2 style={{ marginTop: 0, fontSize: 20 }}>USD Sandbox Spend Breakdown</h2>
              {summaryUSD && summaryUSD.by_category ? (
                <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                  {Object.entries(summaryUSD.by_category).map(([cat, amt]) => (
                    <div
                      key={cat}
                      style={{
                        padding: 12,
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        display: "flex",
                        justifyContent: "space-between",
                        fontWeight: 600,
                      }}
                    >
                      <span style={{ textTransform: "capitalize" }}>{cat}</span>
                      <span>USD {amt}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No USD transactions recorded yet.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === "subscriptions" && (
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 20 }}>Recurring Subscriptions & Renewal Tracker</h2>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              Tracks user-confirmed recurring software and service charges.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  style={{
                    padding: 16,
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{sub.merchant}</div>
                    <div style={{ fontSize: 13, color: "#64748b" }}>
                      Cadence: {sub.cadence} &bull;{" "}
                      {sub.confirmed ? "User Confirmed" : "Suggested Match"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>
                      {sub.currency} {sub.amount}
                    </span>
                    <button
                      onClick={() =>
                        setPendingOrder({
                          merchant: sub.merchant,
                          amount: sub.amount,
                          currency: sub.currency,
                          description: `${sub.cadence} renewal for ${sub.merchant}`,
                          provider: "PayPal Sandbox Checkout (Orders v2)",
                        })
                      }
                      style={primaryBtnStyle}
                    >
                      Pay Renewal via Sandbox
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "copilot" && (
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, fontSize: 20 }}>AI Financial Copilot (Tool-Backed)</h2>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>
              Uses read-only backend tools for spending queries and split math, and triggers explicit confirmation for payment actions.
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {[
                "How much did I spend on food last month?",
                "How much did I spend on travel last month?",
                "Split 3000 equally among 4 people",
                "Split 100 equally among 3 people",
                "Pay CloudHost 25",
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSendChat(null, prompt)}
                  style={{
                    padding: "6px 12px",
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    border: "1px solid #bfdbfe",
                    borderRadius: 999,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: 16,
                minHeight: 280,
                maxHeight: 420,
                overflowY: "auto",
                background: "#f8fafc",
                marginBottom: 14,
              }}
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 12,
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: m.role === "user" ? "#003087" : "#ffffff",
                    color: m.role === "user" ? "#ffffff" : "#0f172a",
                    border: m.role === "user" ? "none" : "1px solid #e2e8f0",
                    maxWidth: "85%",
                    marginLeft: m.role === "user" ? "auto" : 0,
                  }}
                >
                  <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4, fontWeight: 600 }}>
                    {m.role === "user" ? "YOU" : "POCKETPILOT AI"}
                    {m.tool ? ` • TOOL: ${m.tool}` : ""}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.5 }}>{m.text}</div>
                </div>
              ))}
            </div>

            <form onSubmit={(e) => handleSendChat(e, null)} style={{ display: "flex", gap: 10 }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about your spending, split an expense, or prepare a payment..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <button type="submit" style={primaryBtnStyle}>
                Send Message
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  padding: 20,
  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
};

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 6,
  border: "1px solid #cbd5e1",
  fontSize: 14,
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#475569",
  marginBottom: 4,
};

const primaryBtnStyle = {
  padding: "10px 16px",
  background: "#0070ba",
  color: "#ffffff",
  border: "none",
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};

const secondaryBtnStyle = {
  padding: "8px 14px",
  background: "#f1f5f9",
  color: "#0f172a",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};

const badgeStyle = {
  background: "#f1f5f9",
  color: "#334155",
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
};
