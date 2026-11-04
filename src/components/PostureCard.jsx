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
//    timerS       – Timer_D (seconds of work without a fatigue check)
//    promptAfterS – threshold that triggers "Cek kelelahan sekarang?"
//    ended        – session ended
// ─────────────────────────────────────────────

import { Card } from './Card'
import ImuVisualizer from './ImuVisualizer'
import { formatDuration } from '../hooks/useSafeDistanceTimer'

export const POSTURE_LIMIT_DEG = 15   // bad posture above this
export const POSTURE_WARN_DEG = 10    // early warning from here

function tone(dev) {
  const a = Math.abs(dev)
  if (a > POSTURE_LIMIT_DEG) return { text: 'text-red-600', dot: '#ef4444', msg: 'Postur menyimpang. Tegakkan kepala Anda.' }
  if (a >= POSTURE_WARN_DEG) return { text: 'text-amber-600', dot: '#f59e0b', msg: 'Kepala mulai bergeser, luruskan kembali.' }
  return { text: 'text-green-600', dot: '#22c55e', msg: 'Postur baik.' }
}

export function PostureCard({ show, offline, pitchDev, basePitch, timerS, promptAfterS, ended }) {
  const has = show && pitchDev != null
  const t = has ? tone(pitchDev) : { text: 'text-slate-500', dot: '#94a3b8', msg: 'Menunggu data sensor…' }
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
            <p className="m-0 mt-1 text-xs text-slate-500 tabular-nums">
              Batas ±{POSTURE_LIMIT_DEG}° · titik tegak {basePitch != null ? `${basePitch.toFixed(1)}°` : '—'}
            </p>
          </div>

          <div>
            <p className="m-0 text-xs font-semibold text-slate-500">Waktu kerja tanpa istirahat (Timer_D)</p>
            <p className="m-0 mt-1 text-2xl font-extrabold tabular-nums">{formatDuration(Math.floor(timerS))}</p>
            <div className="mt-2 h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Menuju cek kelelahan">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: pct >= 100 ? '#ef4444' : '#3a8dff' }} />
            </div>
            <p className="m-0 mt-1.5 text-xs text-slate-500">
              {ended ? 'Sesi dihentikan.' : left > 0 ? `Cek kelelahan dalam ±${Math.ceil(left / 60)} menit.` : 'Saatnya cek kelelahan.'}
            </p>
          </div>
        </div>

        <div className="rounded-xl overflow-hidden border border-[#dbe6f7] h-[clamp(220px,22vw,320px)]">
          <ImuVisualizer roll={0} pitch={has ? pitchDev : 0} yaw={0} />
        </div>
      </div>
    </Card>
  )
}
