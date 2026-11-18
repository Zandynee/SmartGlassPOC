// ─────────────────────────────────────────────
//  SessionOverlays.jsx  –  small overlays for the dashboard
//    OfflineBanner       "Mode offline – Mencari kacamata…" (sticky, nothing is cleared)
//    CheckPrompt         Timer_D reached the limit → "Mau cek kondisi?" (Ya / Nanti)
//    BaselineBanner      today's baseline is missing → "Buat baseline"
//    SessionEndedBanner  after "End session" in CHECK_MODE
// ─────────────────────────────────────────────

import { CloseIcon } from './icons'

const fmtMin = (s) => Math.max(1, Math.round(s / 60))

export function OfflineBanner({ searching = true }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-16 z-dropdown flex items-center gap-3 px-4 md:px-6 py-2 bg-warning-surface border-b border-warning-line text-warning-deep text-sm"
    >
      <span
        className={`inline-block size-spinner shrink-0 rounded-full border-2 border-warning-solid border-t-transparent ${searching ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <span>
        <span className="font-medium">Mode offline</span> – {searching ? 'Mencari kacamata…' : 'kacamata tidak terhubung.'} Data Anda tetap
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
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-modal rounded-lg bg-ink text-white text-sm px-4 py-2 shadow-float">
        Menghubungi kacamata untuk mulai pengukuran…
      </div>
    )
  }
  if (!open) return null

  return (
    <div className="fixed inset-0 z-modal grid place-items-center p-4 bg-backdrop">
      <div role="dialog" aria-modal="true" aria-label="Cek kondisi" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-float">
        <h2 className="m-0 text-xl font-semibold">Mau cek kondisi?</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Sudah cukup lama bekerja (±{fmtMin(timerS)} menit). Pengukuran memakan waktu ±3 menit: taruh kacamata
          di meja, diam, dan tempelkan jari pada sensor di temple.
        </p>
        {offline && <p className="mt-2 text-xs font-medium text-warning-strong">Kacamata tidak terhubung – pengukuran bisa dimulai setelah tersambung kembali.</p>}
        {error && !offline && <p className="mt-2 flex items-center gap-2 text-xs font-mono text-danger"><CloseIcon size={14} className="shrink-0" /> {error}</p>}
        <div className="mt-6 flex gap-2 justify-end">
          <button onClick={onNo} className="h-10 px-4 rounded-lg border border-line-strong bg-white text-sm font-medium text-ink-soft hover:bg-mist cursor-pointer">
            Nanti
          </button>
          <button onClick={onYes} disabled={offline} className="h-10 px-5 rounded-lg bg-primary text-sm font-medium text-white hover:bg-primary-hover cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
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
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-warning-line bg-warning-surface px-4 py-3 text-sm text-warning-deep">
      <span>
        <span className="font-medium">Baseline hari ini belum dibuat.</span>{' '}
        {hasOld ? 'Cek masih memakai baseline lama. ' : ''}Anda bisa membuat yang baru (±6 menit) atau memakai kembali baseline yang ada.
      </span>
      <button
        onClick={onStart}
        disabled={disabled}
        className="h-9 px-4 rounded-lg bg-white border border-warning-line font-medium hover:bg-warning-tint cursor-pointer disabled:opacity-50"
      >
        Buat baseline
      </button>
    </div>
  )
}

export function SessionEndedBanner({ onStart }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-ok-line bg-ok-surface px-4 py-3 text-sm text-ok-deep">
      <span><span className="font-medium">Sesi selesai.</span> Pemantauan waktu kerja dihentikan. Sensor detak jantung sudah dimatikan.</span>
      <button onClick={onStart} className="h-9 px-4 rounded-lg bg-white border border-ok-line-strong font-medium hover:bg-ok-tint cursor-pointer">
        Mulai sesi baru
      </button>
    </div>
  )
}
