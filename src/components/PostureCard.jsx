// ─────────────────────────────────────────────
//  PostureCard.jsx  –  "Postur Kepala & Waktu Kerja" (WORK_MODE)
//  Replaces CalibrationCard + ImuReadings. The firmware now sends only
//  pitch_deg, so posture = pitch − baseline.posture.pitchDeg (computed in App).
//
//  Props
//    show         – have we ever received IMU data in WORK_MODE (else "Menunggu…")
//    offline      – link down → values stay, card is dimmed
//    pitchDev     – degrees from the saved upright posture, or null
//    basePitch    – baseline pitch (deg) or null
//    timerS       – Timer_D (seconds of work without an HRV check)
//    promptAfterS – threshold that triggers "Mau cek kondisi?"
//    ended        – session ended
//    onCheck      – "Cek kondisi sekarang" (any time, no waiting for Timer_D); null hides the button
//    checkDisabled / checkHint – why the button is off (offline, no baseline, …)
//    onBaseline   – "Perbarui baseline" opens the baseline wizard
// ─────────────────────────────────────────────

import { Card } from './Card'
import ImuVisualizer from './ImuVisualizer'
import { formatDuration } from '../hooks/useSafeDistanceTimer'

export const POSTURE_LIMIT_DEG = 15   // bad posture above this
export const POSTURE_WARN_DEG = 10    // early warning from here

function tone(dev) {
  const a = Math.abs(dev)
  if (a > POSTURE_LIMIT_DEG) return { text: 'text-danger', dot: '#ef4444', msg: 'Postur menyimpang. Tegakkan kepala Anda.' }
  if (a >= POSTURE_WARN_DEG) return { text: 'text-warning', dot: '#f59e0b', msg: 'Kepala mulai bergeser, luruskan kembali.' }
  return { text: 'text-ok', dot: '#22c55e', msg: 'Postur baik.' }
}

export function PostureCard({ show, offline, pitchDev, basePitch, timerS, promptAfterS, ended, onCheck, checkDisabled, checkHint, onBaseline }) {
  const has = show && pitchDev != null
  const t = has ? tone(pitchDev) : { text: 'text-ink-muted', dot: '#94a3b8', msg: 'Menunggu data sensor…' }
  const pct = Math.min(100, (timerS / promptAfterS) * 100)
  const left = Math.max(0, promptAfterS - timerS)

  return (
    <Card title="Postur Kepala & Waktu Kerja" dot={t.dot} className="h-full">
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 ${offline ? 'opacity-60' : ''}`}>
        <div className="flex flex-col gap-4">
          <div>
            <p className={`m-0 flex items-baseline gap-1.5 ${t.text}`}>
              <span className="text-4xl font-extrabold tabular-nums">
                {has ? `${pitchDev > 0 ? '+' : pitchDev < 0 ? '−' : ''}${Math.abs(pitchDev).toFixed(1)}` : '—'}
              </span>
              <span className="text-base font-semibold">° dari tegak</span>
            </p>
            <p className={`m-0 mt-1 text-sm font-semibold ${t.text}`}>{t.msg}</p>
            <p className="m-0 mt-1 text-xs text-ink-muted tabular-nums">
              Batas ±{POSTURE_LIMIT_DEG}° · titik tegak {basePitch != null ? `${basePitch.toFixed(1)}°` : '—'}
            </p>
          </div>

          <div>
            <p className="m-0 text-xs font-semibold text-ink-muted">Waktu kerja tanpa istirahat (Timer_D)</p>
            <p className="m-0 mt-1 text-2xl font-extrabold tabular-nums">{formatDuration(Math.floor(timerS))}</p>
            <div className="mt-2 h-bar rounded-full bg-wash overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Menuju cek kondisi">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct >= 100 ? '#ef4444' : '#3a8dff' }} />
            </div>
            <p className="m-0 mt-1.5 text-xs text-ink-muted">
              {ended ? 'Sesi dihentikan.' : left > 0 ? `Cek kondisi dalam ±${Math.ceil(left / 60)} menit.` : 'Saatnya cek kondisi.'}
            </p>
            {(onCheck || onBaseline) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {onCheck && (
                  <button
                    onClick={onCheck}
                    disabled={checkDisabled}
                    className="h-control-md px-4 rounded-full bg-primary text-white text-sm font-bold hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Cek kondisi sekarang
                  </button>
                )}
                {onBaseline && (
                  <button
                    onClick={onBaseline}
                    className="h-control-md px-4 rounded-full border border-line-strong bg-white text-sm font-semibold text-ink-soft hover:bg-mist cursor-pointer"
                  >
                    Perbarui baseline
                  </button>
                )}
              </div>
            )}
            {checkHint && <p className="m-0 mt-1.5 text-xs text-ink-muted">{checkHint}</p>}
          </div>
        </div>

        <div className="rounded-xl overflow-hidden border border-line h-visualizer">
          <ImuVisualizer roll={0} pitch={has ? pitchDev : 0} yaw={0} />
        </div>
      </div>
    </Card>
  )
}
