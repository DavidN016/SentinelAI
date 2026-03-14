import { useEffect, useRef, useState } from 'react'
import './App.css'

type AlertMessage = {
  fault: string
  severity: 'high' | 'medium' | 'low'
  explanation: string
  is_repeat_offender: boolean
  event_id: string
}

type BackendMessage =
  | AlertMessage
  | {
      error: string
      message: string
    }

/** One alert plus optional raw payload for details (6.3.2) */
type AlertEntry = { alert: BackendMessage; raw?: string }

const WS_URL = 'ws://127.0.0.1:8000/ws/threats'

const isElectron = typeof window !== 'undefined' && !!window.sentinelai

function LatestAlertCard({
  alert,
  rawPayload,
  rawDetailsOpen,
  onToggleRawDetails,
}: {
  alert: AlertMessage
  rawPayload?: string
  rawDetailsOpen: boolean
  onToggleRawDetails: () => void
}) {
  return (
    <div
      style={{
        borderRadius: '0.75rem',
        padding: '0.85rem',
        border: '1px solid rgba(248, 250, 252, 0.05)',
        background: alert.is_repeat_offender
          ? 'linear-gradient(135deg, rgba(22, 163, 74, 0.25), rgba(15, 23, 42, 0.95))'
          : 'linear-gradient(135deg, rgba(220, 38, 38, 0.25), rgba(15, 23, 42, 0.95))',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.2rem',
        }}
      >
        Fault
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '1rem', color: '#f1f5f9' }}>
          {alert.fault}
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.15rem 0.55rem',
              borderRadius: '999px',
              backgroundColor:
                alert.severity === 'high'
                  ? '#dc2626'
                  : alert.severity === 'medium'
                    ? '#ea580c'
                    : '#4b5563',
              color: '#f9fafb',
            }}
          >
            {alert.severity}
          </span>
          {alert.is_repeat_offender && (
            <span
              style={{
                fontSize: '0.75rem',
                padding: '0.15rem 0.55rem',
                borderRadius: '999px',
                backgroundColor: '#22c55e',
                color: '#0f172a',
                fontWeight: 600,
              }}
            >
              Cached
            </span>
          )}
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.15rem 0.55rem',
              borderRadius: '999px',
              backgroundColor: alert.is_repeat_offender ? '#15803d' : '#f97316',
              color: alert.is_repeat_offender ? '#f0fdf4' : '#0f172a',
              fontWeight: 600,
            }}
          >
            {alert.is_repeat_offender ? 'Repeat offender' : 'First seen'}
          </span>
        </div>
      </div>
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: '#94a3b8',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '0.25rem',
        }}
      >
        Explanation
      </div>
      <p style={{ margin: 0, fontSize: '0.9rem', color: '#e5e7eb', lineHeight: 1.45 }}>
        {alert.explanation}
      </p>
      <p
        style={{
          margin: 0,
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: '#9ca3af',
        }}
      >
        event_id: <code>{alert.event_id}</code>
      </p>
      <div style={{ marginTop: '0.75rem' }}>
        <button
          type="button"
          onClick={onToggleRawDetails}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#94a3b8',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {rawDetailsOpen ? '▼' : '▶'} Raw event payload
        </button>
        {rawDetailsOpen && (
          <pre
            style={{
              margin: 0,
              padding: '0.6rem',
              fontSize: '0.75rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
              background: 'rgba(0, 0, 0, 0.35)',
              borderRadius: '0.4rem',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              color: '#cbd5e1',
              overflow: 'auto',
              maxHeight: 200,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {rawPayload ?? JSON.stringify(alert, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>(
    'disconnected',
  )
  const [input, setInput] = useState(
    JSON.stringify({ source: 'frontend', payload: "' OR 1=1--" }, null, 2),
  )
  const [rawMessages, setRawMessages] = useState<string[]>([])

  // 6.1.1 Alert ingestion: subscribe via preload IPC, store history + derive latest
  const [alertHistory, setAlertHistory] = useState<AlertEntry[]>([])
  const latestEntry = alertHistory.at(-1)
  const latestAlert = latestEntry?.alert
  const wsRef = useRef<WebSocket | null>(null)
  const [rawDetailsOpen, setRawDetailsOpen] = useState(false)

  // IPC bridge (Electron): subscribe to alerts from main; store each in history
  useEffect(() => {
    if (!isElectron || !window.sentinelai) return

    window.sentinelai.getConnectionStatus().then(setStatus)
    const removeStatus = window.sentinelai!.onConnectionStatus(setStatus)
    const removeAlert = window.sentinelai!.onAlert((payload: unknown) => {
      const raw =
        typeof payload === 'string' ? payload : JSON.stringify(payload)
      setRawMessages((prev) => [...prev, raw])
      try {
        const parsed = (
          typeof payload === 'string' ? JSON.parse(payload) : payload
        ) as BackendMessage
        setAlertHistory((prev) => [...prev, { alert: parsed, raw }])
      } catch {
        setAlertHistory((prev) => [
          ...prev,
          { alert: { error: 'parse_failed', message: raw.slice(0, 200) }, raw },
        ])
      }
    })

    return () => {
      removeStatus()
      removeAlert()
    }
  }, [])

  // Direct WebSocket (browser / non-Electron)
  useEffect(() => {
    if (isElectron) return

    setStatus('connecting')
    const socket = new WebSocket(WS_URL)
    wsRef.current = socket

    socket.onopen = () => setStatus('connected')
    socket.onclose = () => {
      setStatus('disconnected')
      wsRef.current = null
    }
    socket.onerror = () => {
      setStatus('disconnected')
    }
    socket.onmessage = (event) => {
      const data = event.data as string
      setRawMessages((prev) => [...prev, data])
      try {
        const parsed = JSON.parse(data) as BackendMessage
        setAlertHistory((prev) => [...prev, { alert: parsed, raw: data }])
      } catch {
        // keep raw string only
      }
    }

    return () => {
      socket.close()
    }
  }, [isElectron])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed) return

    setRawMessages((prev) => [...prev, `→ ${trimmed}`])

    if (isElectron && window.sentinelai) {
      let payload: object | string
      try {
        payload = JSON.parse(trimmed) as object
      } catch {
        payload = trimmed
      }
      window.sentinelai.sendEvent(payload).then((result) => {
        if (!result.ok) {
          setAlertHistory((prev) => [
            ...prev,
            {
              alert: {
                error: 'send_failed',
                message: result.error ?? 'Unknown error',
              },
            },
          ])
        }
      })
      return
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      const errorMessage: BackendMessage = {
        error: 'not_connected',
        message:
          'WebSocket is not connected. Ensure the backend is running on ws://127.0.0.1:8000/ws/threats.',
      }
      setAlertHistory((prev) => [...prev, { alert: errorMessage }])
      return
    }

    try {
      wsRef.current.send(trimmed)
    } catch (err) {
      const errorMessage: BackendMessage = {
        error: 'send_failed',
        message: err instanceof Error ? err.message : String(err),
      }
      setAlertHistory((prev) => [...prev, { alert: errorMessage }])
    }
  }

  const statusColor =
    status === 'connected'
      ? '#16a34a'
      : status === 'connecting'
        ? '#f97316'
        : '#b91c1c'

  // 6.2.1 Active incident: high-severity alert → red state + sticky banner
  const activeIncident =
    latestAlert &&
    !('error' in latestAlert) &&
    (latestAlert as AlertMessage).severity === 'high'
      ? (latestAlert as AlertMessage)
      : null

  return (
    <div
      style={{
        minHeight: '100vh',
        margin: 0,
        padding: '1.5rem',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        background: '#020617',
        color: '#e5e7eb',
      }}
    >
      {/* 6.2.1 Red banner + sticky "active incident" when severity is high */}
      {activeIncident && (
        <div
          role="alert"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            marginBottom: '1rem',
            padding: '0.75rem 1rem',
            background: 'linear-gradient(90deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)',
            border: '1px solid #dc2626',
            borderRadius: '0.5rem',
            color: '#fef2f2',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontWeight: 700,
              fontSize: '0.9rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#fef2f2',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
            Active incident
          </span>
          <span style={{ fontSize: '0.9rem', opacity: 0.95 }}>
            {activeIncident.fault}
          </span>
        </div>
      )}

      <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem' }}>SentinelAI Threat Dashboard</h1>
          <p style={{ margin: 0, marginTop: '0.3rem', fontSize: '0.9rem', color: '#9ca3af' }}>
            Send sample events to the backend WebSocket and observe cache hits vs. misses.
          </p>
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.25rem 0.7rem',
            borderRadius: '999px',
            border: '1px solid rgba(148, 163, 184, 0.4)',
            fontSize: '0.8rem',
            background: 'rgba(15, 23, 42, 0.85)',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '999px',
              backgroundColor: statusColor,
            }}
          />
          <span>{status === 'connected' ? 'Connected to backend' : status === 'connecting' ? 'Connecting…' : 'Disconnected'}</span>
        </span>
      </header>

      <main
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
          gap: '1.5rem',
          alignItems: 'flex-start',
        }}
      >
        <section
          style={{
            borderRadius: '0.9rem',
            border: '1px solid rgba(148, 163, 184, 0.4)',
            background:
              'radial-gradient(circle at top left, rgba(37, 99, 235, 0.35), transparent 55%), #020617',
            padding: '1.1rem',
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '1rem' }}>
            Test Event
          </h2>
          <p style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '0.9rem', color: '#9ca3af' }}>
            Edit the JSON payload and send it to <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco', fontSize: '0.8rem' }}>{WS_URL}</code>.
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={10}
            style={{
              width: '100%',
              resize: 'vertical',
              borderRadius: '0.6rem',
              border: '1px solid rgba(148, 163, 184, 0.7)',
              background: '#020617',
              color: '#e5e7eb',
              padding: '0.75rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco',
              fontSize: '0.85rem',
              marginBottom: '0.75rem',
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem 1rem',
              borderRadius: '999px',
              border: 'none',
              background:
                'linear-gradient(135deg, #22c55e, #4f46e5, #ec4899)',
              color: '#f9fafb',
              fontWeight: 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 12px 30px rgba(15, 23, 42, 0.7)',
            }}
          >
            Send event
          </button>
        </section>

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <div
            style={{
              borderRadius: '0.9rem',
              border:
                activeIncident
                  ? '2px solid #dc2626'
                  : '1px solid rgba(148, 163, 184, 0.4)',
              background: activeIncident
                ? 'rgba(127, 29, 29, 0.2)'
                : '#020617',
              padding: '1rem',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '0.6rem', fontSize: '1rem' }}>
              Latest Alert
              {activeIncident && (
                <span
                  style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#fca5a5',
                    textTransform: 'uppercase',
                  }}
                >
                  — Active incident
                </span>
              )}
            </h2>
            {!latestAlert || 'error' in latestAlert ? (
              <p style={{ fontSize: '0.9rem', color: '#9ca3af', margin: 0 }}>
                {latestAlert && 'error' in latestAlert
                  ? `Error: ${latestAlert.message}`
                  : 'No alerts yet. Send an event to see the stub alert.'}
              </p>
            ) : (
              <LatestAlertCard
                alert={latestAlert as AlertMessage}
                rawPayload={latestEntry?.raw}
                rawDetailsOpen={rawDetailsOpen}
                onToggleRawDetails={() => setRawDetailsOpen((open) => !open)}
              />
            )}
          </div>

          <div
            style={{
              borderRadius: '0.9rem',
              border: '1px solid rgba(148, 163, 184, 0.4)',
              background: '#020617',
              padding: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1rem' }}>Raw Stream</h2>
              {rawMessages.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setRawMessages([])
                    setAlertHistory([])
                  }}
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '0.4rem',
                    border: '1px solid rgba(148, 163, 184, 0.7)',
                    background: '#020617',
                    color: '#e5e7eb',
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <div
              style={{
                maxHeight: 220,
                overflowY: 'auto',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco',
                fontSize: '0.8rem',
                background: '#020617',
                borderRadius: '0.6rem',
                border: '1px solid rgba(30, 64, 175, 0.6)',
                padding: '0.6rem',
              }}
            >
              {rawMessages.length === 0 ? (
                <div style={{ opacity: 0.6 }}>No messages yet.</div>
              ) : (
                rawMessages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: '0.25rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
