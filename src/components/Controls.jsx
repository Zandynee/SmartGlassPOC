// ─────────────────────────────────────────────
//  Controls.jsx  –  UI component
//  Connection & simulation controls only.
//  Zero business logic — delegates to props.
// ─────────────────────────────────────────────

const btnBase =
  'inline-block px-3.5 py-1.5 text-sm font-mono ' +
  'rounded-md border cursor-pointer transition-all ' +
  'hover:shadow-[var(--shadow)]'

export function Controls({
  connected,
  simulating,
  bleError,
  bleSupported,
  onToggleConnection,
  onToggleSimulation,
  onReset,
}) {
  return (
    <div className="mb-2">

      {/* ── Web Bluetooth not available notice ── */}
      {!bleSupported && (
        <p className="mb-2 text-xs font-mono text-amber-500 border border-amber-500/30 bg-amber-500/10 rounded-md px-3 py-1.5">
          ⚠ Web Bluetooth API unavailable — use Chrome or Edge (desktop) over https or localhost.
          Simulation mode still works.
        </p>
      )}

      {/* ── BLE error banner ── */}
      {bleError && (
        <p className="mb-2 text-xs font-mono text-red-400 border border-red-400/30 bg-red-400/10 rounded-md px-3 py-1.5">
          ✕ {bleError}
        </p>
      )}

      {/* ── Connect / Disconnect BLE ── */}
      <button
        className={`${btnBase} ${
          connected
            ? 'border-green-500 text-green-600 bg-green-500/10'
            : 'border-[var(--border)] bg-[var(--social-bg)] text-[var(--text-h)]'
        }`}
        onClick={onToggleConnection}
        disabled={!bleSupported && !connected}
        title={
          !bleSupported
            ? 'Web Bluetooth API not available in this browser'
            : connected
            ? 'Disconnect from SmartGlasses'
            : 'Connect to SmartGlasses via Bluetooth LE'
        }
      >
        <span
          className={`inline-block w-[7px] h-[7px] rounded-full transition-colors ${
            connected
              ? 'bg-green-500 shadow-[0_0_6px_#22c55e88]'
              : 'bg-gray-400'
          }`}
        />
        {connected ? ' Disconnect BLE' : ' Connect BLE'}
      </button>

      {/* ── Simulate / Stop ── */}
      <button
        className={`${btnBase} ${
          simulating
            ? 'border-[var(--accent-border)] text-[var(--accent)] bg-[var(--accent-bg)]'
            : 'border-[var(--border)] bg-[var(--social-bg)] text-[var(--text-h)]'
        } ${connected ? 'opacity-40 cursor-not-allowed' : ''}`}
        onClick={onToggleSimulation}
        disabled={connected}
        title={connected ? 'Disconnect BLE before using simulation' : undefined}
      >
        {simulating ? '⏹ Stop' : '▶ Simulate'}
      </button>

      {/* ── Reset ── */}
      <button
        className={`${btnBase} border-[var(--border)] bg-[var(--social-bg)] text-[var(--text-h)] opacity-65 hover:opacity-100`}
        onClick={onReset}
      >
        ↺ Reset
      </button>

    </div>
  )
}