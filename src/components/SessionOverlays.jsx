// ─────────────────────────────────────────────
//  SessionOverlays.jsx  –  small overlays for the dashboard
//    OfflineBanner       "Mode Offline – Mencari kacamata…" (sticky, nothing is cleared)
//    CheckPrompt         Timer_D reached the limit → "Mau cek kondisi?" (Ya / Nanti)
//    BaselineBanner      today's baseline is missing → "Buat baseline"
//    SessionEndedBanner  after "End session" in CHECK_MODE
// ─────────────────────────────────────────────

const fmtMin = (s) => Math.max(1, Math.round(s / 60))

export function OfflineBanner({ searching = true }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-16 z-20 flex items-center gap-3 px-4 md:px-6 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm"
    >
      <span
        className={`inline-block w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent ${searching ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <span>
        <b>Mode Offline</b> – {searching ? 'Mencari kacamata…' : 'kacamata tidak terhubung.'} Data Anda tetap
        tersimpan; layar menyesuaikan otomatis begitu tersambung kembali.
      </span>
    </div>
  )
}

/**
 * open    – g.s.work.prompt
 * pending – true while the app waits for the glasses to confirm CHECK_MODE
 * error   – g.error (shown if the write failed; the prompt re-opens by itself)
 */
export function CheckPrompt({ open, pending, error, timerS, offline = false, onYes, onNo }) {
  if (pending && !open) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-modal rounded-full bg-ink text-white text-sm px-4 py-2 shadow-xl">
        Menghubungi kacamata untuk mulai pengukuran…
      </div>
    )
  }
  if (!open) return null

  return (
    <div className="fixed inset-0 z-modal grid place-items-center p-4 bg-backdrop">
      <div role="dialog" aria-modal="true" aria-label="Cek kondisi" className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="m-0 text-xl font-extrabold">Mau cek kondisi?</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Sudah cukup lama bekerja (±{fmtMin(timerS)} menit). Pengukuran memakan waktu ±3 menit: taruh kacamata
          di meja, diam, dan tempelkan jari pada sensor di temple.
        </p>
        {offline && <p className="mt-2 text-xs font-semibold text-warning-strong">Kacamata tidak terhubung – pengukuran bisa dimulai setelah tersambung kembali.</p>}
        {error && !offline && <p className="mt-2 text-xs font-mono text-danger">✕ {error}</p>}
        <div className="mt-5 flex gap-2 justify-end">
          <button onClick={onNo} className="h-10 px-4 rounded-full border border-line-strong bg-white text-sm font-semibold text-ink-soft hover:bg-mist cursor-pointer">
            Nanti
          </button>
          <button onClick={onYes} disabled={offline} className="h-10 px-5 rounded-full bg-[var(--vg-tab-active)] text-sm font-bold text-white hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            Ya
          </button>
        </div>
      </div>
    </div>
  )
}

/** Baseline is not from today (or missing): ask for the daily refresh. */
export function BaselineBanner({ onStart, disabled, hasOld }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-warning-line bg-warning-surface px-4 py-3 text-sm text-warning-deep">
      <span>
        <b>Baseline hari ini belum dibuat.</b>{' '}
        {hasOld ? 'Cek masih memakai baseline lama. ' : ''}Anda bisa membuat yang baru (±6 menit) atau memakai kembali baseline yang ada.
      </span>
      <button
        onClick={onStart}
        disabled={disabled}
        className="h-9 px-4 rounded-full bg-white border border-warning-line font-semibold hover:bg-warning-tint cursor-pointer disabled:opacity-50"
      >
        Buat baseline
      </button>
    </div>
  )
}

export function SessionEndedBanner({ onStart }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <span><b>Sesi selesai.</b> Pemantauan waktu kerja dihentikan. Sensor detak jantung sudah dimatikan.</span>
      <button onClick={onStart} className="h-9 px-4 rounded-full bg-white border border-emerald-300 font-semibold hover:bg-emerald-100 cursor-pointer">
        Mulai sesi baru
      </button>
    </div>
  )
}
