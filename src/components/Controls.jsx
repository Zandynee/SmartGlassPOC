// ─────────────────────────────────────────────
//  Controls.jsx  –  connection & simulation controls
//  Zero business logic — delegates to props.
//  `connecting` shows a spinner + notice while the native BLE scan
//  (~8 s) is running, and locks the other buttons.
// ─────────────────────────────────────────────

const btnBase =
  'inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white border border-[#c9d9f2] ' +
  'text-sm font-semibold cursor-pointer transition-colors hover:border-[var(--vg-tab-active)] ' +
  'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#c9d9f2]'

function Spinner() {
  return (
    <span
      className="inline-block w-4 h-4 rounded-full border-2 border-[var(--vg-tab-active)] border-t-transparent animate-spin"
      aria-hidden="true"
    />
  )
}

export function Controls({
  connected,
  simulating,
  connecting = false,
  bleError,
  onToggleConnection,
  onToggleSimulation,
  onReset,
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      {connecting && (
        <p
          role="status"
          aria-live="polite"
          className="max-w-xl flex items-center gap-2 text-xs text-[var(--vg-tab-active)] border border-[#c9d9f2] bg-[#f3f8ff] rounded-xl px-3 py-1.5"
        >
          <Spinner />
          Mencari VisioGuard… pastikan kacamata menyala dan berada di dekat komputer (hingga ±8 detik).
        </p>
      )}

      {bleError && !connecting && (
        <p className="max-w-xl text-xs font-mono text-red-600 border border-red-300 bg-red-50 rounded-xl px-3 py-1.5">
          ✕ {bleError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          className={`${btnBase} ${connected ? 'text-green-700' : 'text-[var(--vg-tab-active)]'}`}
          onClick={onToggleConnection}
          disabled={connecting}
          aria-busy={connecting}
          title={
            connecting
              ? 'Sedang menghubungkan…'
              : connected
              ? 'Putuskan koneksi dari VisioGuard'
              : 'Hubungkan ke VisioGuard lewat Bluetooth LE'
          }
        >
          {connecting ? (
            <Spinner />
          ) : (
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                connected ? 'bg-green-500 shadow-[0_0_6px_#22c55e88]' : 'bg-gray-400'
              }`}
            />
          )}
          {connecting ? 'Menghubungkan…' : connected ? 'Putuskan BLE' : 'Hubungkan BLE'}
        </button>

        <button
          className={`${btnBase} ${simulating ? 'text-amber-600' : 'text-[var(--vg-tab-active)]'}`}
          onClick={onToggleSimulation}
          disabled={connected || connecting}
          title={connected ? 'Putuskan BLE sebelum memakai simulasi' : undefined}
        >
          {simulating ? '⏹ Berhenti' : '▶ Simulasi'}
        </button>

        <button className={`${btnBase} text-slate-600`} onClick={onReset} disabled={connecting}>
          ↺ Reset
        </button>
      </div>
    </div>
  )
}
