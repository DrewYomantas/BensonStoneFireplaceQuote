import { useState } from 'react'
import { getSalesOsStorage } from '../lib/salesOsStorageBoot.js'
import { getRepByLast4Ssn } from '../lib/repStorage.js'

const PAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

export default function RepLoginScreen({ onLogin }) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function press(digit) {
    setError('')
    setDigits((d) => (d.length < 4 ? d + digit : d))
  }

  function backspace() {
    setError('')
    setDigits((d) => d.slice(0, -1))
  }

  async function submit() {
    if (digits.length < 4 || busy) return
    setBusy(true)
    setError('')
    try {
      const storage = getSalesOsStorage()
      const rep = await getRepByLast4Ssn(storage, digits)
      if (rep && rep.active) {
        await onLogin(rep)
      } else {
        setError('Rep not recognized.')
        setDigits('')
      }
    } catch {
      setError('Something went wrong. Try again.')
      setDigits('')
    }
    setBusy(false)
  }

  return (
    <div
      style={{
        height: '100%',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--stone-50)',
      }}
    >
      <div
        style={{
          background: 'var(--paper)',
          border: '1px solid var(--paper-edge)',
          borderRadius: 'var(--r-4)',
          boxShadow: 'var(--sh-4)',
          padding: '40px 36px',
          width: '100%',
          maxWidth: 320,
          textAlign: 'center',
        }}
      >
        <p className="eyebrow eyebrow-ink" style={{ marginBottom: 6 }}>
          Benson Stone
        </p>
        <h1 className="serif-h h3" style={{ marginBottom: 32 }}>
          Fireplace Sales OS
        </h1>

        <p className="body-sm" style={{ marginBottom: 16, color: 'var(--slate)' }}>
          Enter your last 4
        </p>

        {/* 4-slot display */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 24,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                width: 48,
                height: 52,
                borderRadius: 'var(--r-2)',
                background: 'var(--stone-75)',
                border: `1px solid ${i < digits.length ? 'var(--ink)' : 'var(--stone-200)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                color: 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                transition: 'border-color 0.12s',
              }}
            >
              {i < digits.length ? '●' : ''}
            </div>
          ))}
        </div>

        {/* Numeric pad — 3×3 + 0 row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginBottom: 16,
          }}
        >
          {PAD_DIGITS.map((d) => (
            <button
              key={d}
              type="button"
              className="btn btn-ghost"
              style={{
                minHeight: 'var(--tt-large)',
                fontSize: 18,
                fontFamily: 'var(--font-mono)',
              }}
              onClick={() => press(d)}
              disabled={busy}
            >
              {d}
            </button>
          ))}
          <div />
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              minHeight: 'var(--tt-large)',
              fontSize: 18,
              fontFamily: 'var(--font-mono)',
            }}
            onClick={() => press('0')}
            disabled={busy}
          >
            0
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 'var(--tt-large)', fontSize: 16 }}
            onClick={backspace}
            disabled={busy || digits.length === 0}
          >
            ⌫
          </button>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', minHeight: 'var(--tt-large)' }}
          onClick={submit}
          disabled={digits.length < 4 || busy}
        >
          Continue
        </button>

        {error && (
          <p
            style={{
              marginTop: 14,
              color: 'var(--ember)',
              fontSize: 'var(--fs-caption)',
            }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
