import { useState, useRef, useCallback } from 'react'
import './index.css'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

const IDLE = 'idle'
const CONNECTING = 'connecting'
const ACTIVE = 'active'
const ERROR = 'error'

function useCopy() {
  const [copied, setCopied] = useState(false)
  const t = useRef(null)
  const copy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      clearTimeout(t.current)
      t.current = setTimeout(() => setCopied(false), 2000)
    })
  }, [])
  return [copied, copy]
}

export default function App() {
  const [phase, setPhase] = useState(IDLE)
  const [localUrl, setLocalUrl] = useState('')
  const [publicUrl, setPublicUrl] = useState('')
  const [cliCommand, setCliCommand] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [urlCopied, copyUrl] = useCopy()
  const [cliCopied, copyCli] = useCopy()

  const handleStart = async () => {
    const trimmed = localUrl.trim()
    if (!trimmed) return

    try { new URL(trimmed) } catch {
      setErrorMsg('Invalid URL. Example: http://localhost:3000')
      setPhase(ERROR)
      return
    }

    setPhase(CONNECTING)

    try {
      const res = await fetch(`${SERVER_URL}/api/new`)
      if (!res.ok) throw new Error(`Server responded with ${res.status}`)
      const { tunnelId } = await res.json()

      const wsBase = SERVER_URL.replace(/^http/, 'ws')
      setPublicUrl(`${SERVER_URL}/t/${tunnelId}/`)
      setCliCommand(`node client/index.js ${trimmed} ${tunnelId} ${wsBase}`)
      setPhase(ACTIVE)
    } catch (err) {
      setErrorMsg(`Could not reach the Rootlink server.\n${err.message}`)
      setPhase(ERROR)
    }
  }

  const handleStop = () => {
    setPhase(IDLE)
    setPublicUrl('')
    setCliCommand('')
  }

  return (
    <>
      {/* ---- Header ---- */}
      <header className="header">
        <div className="header-logo">
          Rootlink <span>/ tunnel</span>
        </div>
        <div className="header-tag">v1.0.0</div>
      </header>

      {/* ---- Main ---- */}
      <main className="main">
        <div className="center">

          {/* Title */}
          <div className="title-block">
            <div className="title">Share your local server</div>
            <div className="subtitle">
              Get a public URL for any locally running service — no signup, no config.
            </div>
          </div>

          {/* Input + Button (always shown) */}
          <div className="field-group">
            <div className="field-label">Local URL</div>
            <input
              className="url-input"
              type="url"
              placeholder="http://localhost:3000"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && phase === IDLE && handleStart()}
              disabled={phase === CONNECTING || phase === ACTIVE}
              autoComplete="off"
              spellCheck={false}
              id="localUrl"
            />
            {(phase === IDLE || phase === ERROR) && (
              <button
                className="btn-primary"
                onClick={phase === ERROR ? () => { setPhase(IDLE); setErrorMsg('') } : handleStart}
                disabled={phase === IDLE && !localUrl.trim()}
              >
                {phase === ERROR ? 'Try again' : 'Start Tunneling'}
              </button>
            )}
          </div>

          {/* Loading */}
          {phase === CONNECTING && (
            <div className="loading-block fade-in">
              <div className="loading-bar-wrap">
                <div className="loading-bar" />
              </div>
              <div className="loading-text">Establishing tunnel...</div>
            </div>
          )}

          {/* Error */}
          {phase === ERROR && (
            <div className="error-block fade-in">
              <div className="error-bar">
                <div className="error-msg">{errorMsg}</div>
              </div>
            </div>
          )}

          {/* Active */}
          {phase === ACTIVE && (
            <div className="active-block fade-in">

              <div className="status-row">
                <div className="status-dot" />
                <div className="status-text">Tunnel Active</div>
              </div>

              <div className="output-group">
                <div className="output-label">Public URL</div>
                <div className="output-row">
                  <input
                    className="output-value"
                    readOnly
                    value={publicUrl}
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    className={`btn-copy ${urlCopied ? 'copied' : ''}`}
                    onClick={() => copyUrl(publicUrl)}
                  >
                    {urlCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="output-group">
                <div className="output-label">Run in terminal</div>
                <div className="cli-row">
                  <div className="cli-prompt">$</div>
                  <input
                    className="cli-value"
                    readOnly
                    value={cliCommand}
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    className={`btn-copy ${cliCopied ? 'copied' : ''}`}
                    onClick={() => copyCli(cliCommand)}
                  >
                    {cliCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <button className="btn-stop" onClick={handleStop}>
                Stop tunnel
              </button>
            </div>
          )}

        </div>
      </main>

      {/* ---- Footer ---- */}
      <footer className="footer">
        <div className="footer-text">rootlink — open source</div>
        <div className="footer-text">keep client running while sharing</div>
      </footer>
    </>
  )
}
