import React, { useState } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { exampleAlert } from "../fixtures/alerts";

const WS_URL = "ws://localhost:8000/ws/threats";

function getSeverityStyles(severity) {
  if (severity === "high") return { borderColor: "#dc2626", background: "#fef2f2", badgeBg: "#dc2626" };
  if (severity === "medium") return { borderColor: "#ea580c", background: "#fff7ed", badgeBg: "#ea580c" };
  return { borderColor: "#e5e7eb", background: "#ffffff", badgeBg: "#6b7280" };
}

export function ThreatDashboard() {
  const { messages, isConnected, sendMessage } = useWebSocket(WS_URL);
  const [input, setInput] = useState("");
  const [alerts, setAlerts] = useState([exampleAlert]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <div style={{ padding: "1.5rem", fontFamily: "system-ui" }}>
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>SentinelAI Threat Dashboard</h1>
        <span
          style={{
            display: "inline-block",
            marginTop: "0.5rem",
            padding: "0.2rem 0.6rem",
            borderRadius: "999px",
            fontSize: "0.8rem",
            backgroundColor: isConnected ? "#d1fae5" : "#fee2e2",
            color: isConnected ? "#065f46" : "#b91c1c"
          }}
        >
          {isConnected ? "Connected to backend" : "Disconnected"}
        </span>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "1.5rem"
        }}
      >
        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            padding: "1rem",
            background: "#ffffff"
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Stream</h2>
          <div
            style={{
              maxHeight: 400,
              overflowY: "auto",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco",
              fontSize: "0.85rem",
              background: "#0b1120",
              color: "#e5e7eb",
              padding: "0.75rem",
              borderRadius: "0.5rem"
            }}
          >
            {messages.length === 0 ? (
              <div style={{ opacity: 0.6 }}>No events yet.</div>
            ) : (
              messages.map((m, i) => (
                <div key={i} style={{ marginBottom: "0.25rem" }}>
                  {m}
                </div>
              ))
            )}
          </div>
        </div>

        <div
          style={{
            borderRadius: "0.75rem",
            border: "1px solid #e5e7eb",
            padding: "1rem",
            background: "#ffffff"
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1rem" }}>Test Event</h2>
          <p style={{ fontSize: "0.9rem", color: "#4b5563" }}>
            Send a sample payload to the backend WebSocket to verify the
            end-to-end path.
          </p>
          <textarea
            rows={6}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{
              width: "100%",
              resize: "vertical",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              padding: "0.5rem",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco",
              fontSize: "0.85rem",
              marginBottom: "0.75rem"
            }}
            placeholder='e.g. {"src_ip":"10.0.0.5","dst_ip":"8.8.8.8"}'
          />
          <button
            onClick={handleSend}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.25rem",
              padding: "0.5rem 0.9rem",
              borderRadius: "999px",
              border: "none",
              background:
                "linear-gradient(135deg, #1d4ed8, #7c3aed, #ec4899)",
              color: "#ffffff",
              fontWeight: 500,
              cursor: "pointer",
              boxShadow: "0 10px 25px rgba(15, 23, 42, 0.25)"
            }}
          >
            Send to SentinelAI
          </button>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>Alerts</h2>
          {alerts.length > 0 && (
            <button
              type="button"
              onClick={() => setAlerts([])}
              style={{
                fontSize: "0.8rem",
                padding: "0.25rem 0.5rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#6b7280",
                cursor: "pointer"
              }}
            >
              Clear alerts
            </button>
          )}
        </div>
        {alerts.length === 0 ? (
          <div
            style={{
              padding: "1rem",
              borderRadius: "0.75rem",
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              color: "#6b7280",
              fontSize: "0.9rem"
            }}
          >
            No alerts yet.
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {alerts.map((alert) => {
              const severityStyles = getSeverityStyles(alert.severity);
              return (
              <li
                key={alert.event_id}
                style={{
                  padding: "1rem",
                  borderRadius: "0.75rem",
                  border: "2px solid",
                  borderColor: severityStyles.borderColor,
                  background: severityStyles.background
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                    {alert.fault}
                  </span>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "999px",
                      backgroundColor: severityStyles.badgeBg,
                      color: "#fff"
                    }}
                  >
                    {alert.severity}
                  </span>
                  {alert.is_repeat_offender && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "999px",
                        backgroundColor: "#7c3aed",
                        color: "#fff"
                      }}
                    >
                      Repeat offender
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: "0.9rem", color: "#374151", lineHeight: 1.5 }}>
                  {alert.explanation}
                </p>
              </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
