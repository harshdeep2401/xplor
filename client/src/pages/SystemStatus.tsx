// Live view of where everything runs: this API server, its database, the
// Cloudflare tunnel, and the AI model on the GPU machine. Refreshes every few
// seconds, so during a demo you can import a floor plan in another tab and
// watch the call appear in the activity log.
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import apiClient from '../services/apiClient'
import { getApiErrorMessage } from '../services/errors'
import Button from '../components/ui/Button'
import { buttonClass } from '../components/ui/buttonClass'
import type { SystemStatus as Status } from '../types/api'
import '../styles/status.css'

const REFRESH_MS = 5000

const duration = (s: number) => {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s % 60}s`
  return `${s}s`
}

const time = (iso: string) => new Date(iso).toLocaleTimeString()

type Health = 'ok' | 'warn' | 'down'

function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="status-row">
      <span className="status-label">{label}</span>
      <span className={mono ? 'status-value mono' : 'status-value'}>{value}</span>
    </div>
  )
}

function Card({
  title,
  health,
  summary,
  children,
}: {
  title: string
  health: Health
  summary: string
  children: ReactNode
}) {
  return (
    <section className={`status-card ${health}`}>
      <header>
        <span className={`status-dot ${health}`} aria-hidden="true" />
        <h2>{title}</h2>
      </header>
      <p className="status-summary">{summary}</p>
      <div className="status-rows">{children}</div>
    </section>
  )
}

export default function SystemStatus() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const { data } = await apiClient.get<Status>('/system/status')
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(getApiErrorMessage(err, 'The API server is not answering.'))
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (paused) return
    const id = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(id)
  }, [refresh, paused])

  const ai = status?.ai
  const model = ai?.status
  const tunnel = ai?.route.via === 'cloudflare-tunnel'

  const serverHealth: Health = error ? 'down' : status?.database.ok ? 'ok' : 'warn'
  const routeHealth: Health = !ai ? 'down' : ai.reachable ? (tunnel ? 'ok' : 'warn') : 'down'
  const aiHealth: Health = !model ? 'down' : model.ready ? 'ok' : 'down'

  return (
    <div className="status-page">
      <header className="status-header">
        <Link to="/" className="dashboard-logo">
          XPLOR
        </Link>
        <Link to="/dashboard" className={buttonClass('secondary', 'sm')}>
          ← Dashboard
        </Link>
      </header>

      <main className="status-content">
        <div className="status-title">
          <div>
            <h1>System Status</h1>
            <p>
              {paused ? 'Paused' : `Live, refreshing every ${REFRESH_MS / 1000} s`}
              {status && ` · last check ${time(status.checkedAt)}`}
            </p>
          </div>
          <div className="status-controls">
            <Button size="sm" onClick={refresh}>
              Refresh now
            </Button>
            <Button size="sm" onClick={() => setPaused((p) => !p)}>
              {paused ? 'Resume' : 'Pause'}
            </Button>
          </div>
        </div>

        {/* The path every floor-plan import takes */}
        <div className="status-pipeline" aria-label="Request path">
          <div className="pipe-node ok">Browser</div>
          <div className="pipe-link" />
          <div className={`pipe-node ${serverHealth}`}>
            API server<small>{status?.server.host ?? '…'}</small>
          </div>
          <div className={`pipe-link ${routeHealth}`} />
          <div className={`pipe-node ${routeHealth}`}>
            {tunnel ? 'Cloudflare tunnel' : 'Direct connection'}
            <small>
              {ai?.route.cfColo ? `data centre ${ai.route.cfColo}` : (ai?.route.host ?? '…')}
            </small>
          </div>
          <div className={`pipe-link ${aiHealth}`} />
          <div className={`pipe-node ${aiHealth}`}>
            AI model
            <small>{model ? `${model.host}${model.gpu ? ` · ${model.gpu.name}` : ''}` : '…'}</small>
          </div>
        </div>

        {error && <p className="status-error">{error}</p>}

        {status && ai && (
          <div className="status-grid">
            <Card
              title="Backend (API server)"
              health={serverHealth}
              summary={
                status.database.ok
                  ? 'Running, database connected.'
                  : 'Running, but the database is not answering.'
              }
            >
              <Row label="Machine" value={status.server.host} mono />
              <Row label="System" value={status.server.platform} />
              <Row label="Node.js" value={status.server.node} />
              <Row label="Up for" value={duration(status.server.uptimeS)} />
              <Row
                label="Database"
                value={
                  status.database.ok
                    ? `connected (${status.database.latencyMs} ms)`
                    : 'not reachable'
                }
              />
            </Card>

            <Card
              title="Connection to the AI"
              health={routeHealth}
              summary={
                !ai.reachable
                  ? (ai.error ?? 'The AI service cannot be reached.')
                  : tunnel
                    ? 'Requests travel through a Cloudflare tunnel (Cloudflare stamps each one with a CF-Ray id).'
                    : 'Direct connection (no tunnel): the AI service is on the same network as the server.'
              }
            >
              <Row label="Route" value={tunnel ? 'Cloudflare tunnel' : 'direct'} />
              <Row label="AI address" value={ai.route.host} mono />
              <Row label="CF-Ray (last check)" value={ai.route.cfRay ?? 'none'} mono />
              <Row label="Cloudflare data centre" value={ai.route.cfColo ?? 'n/a'} />
              <Row
                label="Round trip"
                value={ai.roundTripMs != null ? `${ai.roundTripMs} ms` : 'n/a'}
              />
              {ai.reachable && ai.error && <Row label="Problem" value={ai.error} />}
            </Card>

            <Card
              title="AI model"
              health={aiHealth}
              summary={
                !model
                  ? 'No answer from the AI service.'
                  : model.ready
                    ? `Loaded on ${model.gpu ? `the GPU of ${model.host}` : model.host}.`
                    : (model.error ?? 'Not ready.')
              }
            >
              {model && (
                <>
                  <Row label="Machine" value={model.host} mono />
                  <Row
                    label="Runs in"
                    value={model.runningIn === 'docker' ? 'Docker container' : 'directly on the PC'}
                  />
                  <Row
                    label="Device"
                    value={
                      model.gpu ? `${model.gpu.name} (${model.device})` : (model.device ?? 'n/a')
                    }
                  />
                  {model.gpu && (
                    <Row
                      label="GPU memory"
                      value={
                        <span className="status-meter">
                          <span
                            style={{
                              width: `${(100 * model.gpu.memoryUsedMb) / model.gpu.memoryTotalMb}%`,
                            }}
                          />
                          <em>
                            {(model.gpu.memoryUsedMb / 1024).toFixed(1)} /{' '}
                            {(model.gpu.memoryTotalMb / 1024).toFixed(1)} GB (model{' '}
                            {model.gpu.modelMemoryMb} MB)
                          </em>
                        </span>
                      }
                    />
                  )}
                  {model.model && (
                    <>
                      <Row
                        label="Model"
                        value={`${model.model.method} · ${model.model.file} (${model.model.sizeMb} MB)`}
                      />
                      <Row
                        label="Weights fingerprint"
                        value={`sha256 ${model.model.sha256}…`}
                        mono
                      />
                    </>
                  )}
                  <Row label="Up for" value={duration(model.uptimeS)} />
                  <Row label="Detections served" value={model.detectionsServed} />
                  <Row
                    label="Last detection"
                    value={
                      model.lastDetectionAt
                        ? `${time(model.lastDetectionAt)} · ${model.lastDetectionMs} ms on the AI machine`
                        : 'none yet'
                    }
                  />
                </>
              )}
            </Card>
          </div>
        )}

        {status && (
          <section className="status-activity">
            <h2>Recent AI calls</h2>
            <p className="status-summary">
              Every floor-plan import since the server started. Import a plan from the Dashboard in
              another tab and it shows up here.
            </p>
            {status.recentCalls.length === 0 ? (
              <p className="status-empty">No imports yet.</p>
            ) : (
              <div className="status-table-wrap">
                <table className="status-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Result</th>
                      <th>Route</th>
                      <th>CF-Ray</th>
                      <th>Round trip</th>
                      <th>On the AI machine</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.recentCalls.map((call) => (
                      <tr key={`${call.at}-${call.jobId}`}>
                        <td>{time(call.at)}</td>
                        <td className={call.ok ? 'ok' : 'down'}>
                          {call.ok ? 'detected' : call.error}
                        </td>
                        <td>
                          {call.via === 'cloudflare-tunnel'
                            ? `tunnel${call.cfColo ? ` (${call.cfColo})` : ''}`
                            : 'direct'}
                        </td>
                        <td className="mono">{call.cfRay ?? '—'}</td>
                        <td>{call.roundTripMs} ms</td>
                        <td>{call.processingMs != null ? `${call.processingMs} ms` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
