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

const WS_URL = 'ws://127.0.0.1:8000/ws/threats'

const isElectron = typeof window !== 'undefined' && !!window.sentinelai

export default function App() {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>(
    'disconnected',
  )
  const [input, setInput] = useState(
    JSON.stringify({ source: 'frontend', payload: "' OR 1=1--" }, null, 2),
  )
  const [rawMessages, setRawMessages] = useState<string[]>([])
  const [alerts, setAlerts] = useState<BackendMessage[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  // IPC bridge (Electron): main forwards backend alerts; stub capture also sends events → backend → alerts
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
        setAlerts((prev) => [...prev, parsed])
      } catch {
        setAlerts((prev) => [
          ...prev,
          { error: 'parse_failed', message: raw.slice(0, 200) },
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
      setRawMessages((prev) => [...prev, event.data as string])
      try {
        const parsed = JSON.parse(event.data as string) as BackendMessage
        setAlerts((prev) => [...prev, parsed])
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
          setAlerts((prev) => [
            ...prev,
            {
              error: 'send_failed',
              message: result.error ?? 'Unknown error',
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
      setAlerts((prev) => [...prev, errorMessage])
      return
    }

    try {
      wsRef.current.send(trimmed)
    } catch (err) {
      const errorMessage: BackendMessage = {
        error: 'send_failed',
        message: err instanceof Error ? err.message : String(err),
      }
      setAlerts((prev) => [...prev, errorMessage])
    }
  }

  const latestAlert =
    alerts.length > 0 ? alerts[alerts.length - 1] : undefined

  const statusColor =
    status === 'connected'
      ? '#16a34a'
      : status === 'connecting'
        ? '#f97316'
        : '#b91c1c'

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
              border: '1px solid rgba(148, 163, 184, 0.4)',
              background: '#020617',
              padding: '1rem',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '0.6rem', fontSize: '1rem' }}>
              Latest Alert
            </h2>
            {!latestAlert || 'error' in latestAlert ? (
              <p style={{ fontSize: '0.9rem', color: '#9ca3af', margin: 0 }}>
                {latestAlert && 'error' in latestAlert
                  ? `Error: ${latestAlert.message}`
                  : 'No alerts yet. Send an event to see the stub alert.'}
              </p>
            ) : (
              // At this point latestAlert is an AlertMessage
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ((alert => (
              <div
                style={{
                  borderRadius: '0.75rem',
                  padding: '0.85rem',
                  border: '1px solid rgba(248, 250, 252, 0.05)',
                  background:
                    alert.is_repeat_offender
                      ? 'linear-gradient(135deg, rgba(22, 163, 74, 0.25), rgba(15, 23, 42, 0.95))'
                      : 'linear-gradient(135deg, rgba(220, 38, 38, 0.25), rgba(15, 23, 42, 0.95))',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    marginBottom: '0.4rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
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
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.15rem 0.55rem',
                        borderRadius: '999px',
                        backgroundColor: alert.is_repeat_offender
                          ? '#22c55e'
                          : '#f97316',
                        color: '#0f172a',
                        fontWeight: 600,
                      }}
                    >
                      {alert.is_repeat_offender ? 'Repeat offender (cached)' : 'First seen'}
                    </span>
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#e5e7eb' }}>
                  {alert.explanation}
                </p>
                <p
                  style={{
                    margin: 0,
                    marginTop: '0.35rem',
                    fontSize: '0.75rem',
                    color: '#9ca3af',
                  }}
                >
                  event_id: <code>{alert.event_id}</code>
                </p>
              </div>
              ))(latestAlert as AlertMessage))
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
                    setAlerts([])
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
