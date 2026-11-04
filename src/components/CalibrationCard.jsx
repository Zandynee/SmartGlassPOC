// ─────────────────────────────────────────────
//  CalibrationCard.jsx  –  "Kalibrasi dan Visualisasi" card
//  Calibration status + Kalibrasi/Rekalibrasi button on the left,
//  3D head visualizer on the right.
//
//  Props:
//    live          – boolean; receiving real/simulated data
//    calibrated    – boolean; a baseline exists
//    baseline      – { roll, pitch, yaw, ppg, at } | null
//    abnormal      – boolean; IMU deviates from the baseline
//    roll/pitch/yaw – RELATIVE degrees (already minus baseline)
//    onRecalibrate – store a new baseline from the current readings
// ─────────────────────────────────────────────

import { Card } from './Card'
import ImuVisualizer from './ImuVisualizer'

const fmtTime = (ms) =>
  new Date(ms).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function CalibrationCard({
  live, calibrated, baseline, abnormal = false,
  roll, pitch, yaw, onRecalibrate,
}) {
  let title = 'Hubungkan VisioGuard untuk kalibrasi'
  let tone = 'text-slate-500'
  let dot = '#94a3b8'

  if (live && !calibrated) {
    title = 'Belum dikalibrasi'
    tone = 'text-amber-600'
    dot = '#f59e0b'
  } else if (live && calibrated && abnormal) {
    title = 'Posisi kepala menyimpang dari kalibrasi'
    tone = 'text-red-600'
    dot = '#ef4444'
  } else if (live && calibrated) {
    title = 'VisioGuard sudah dikalibrasi'
    tone = 'text-green-600'
    dot = '#22c55e'
  }

  return (
    <Card title="Kalibrasi dan Visualisasi" dot={dot} className="h-full flex flex-col">
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-5 min-h-0">
        <div className="flex flex-col justify-between gap-4">
          <div>
            <p className={`m-0 text-2xl font-extrabold leading-tight tracking-tight ${tone}`}>{title}</p>

            {live && !calibrated && (
              <p className="mt-2 text-sm text-slate-500">
                Duduk tegak dan jaga kepala lurus, lalu tekan Kalibrasi.
              </p>
            )}

            {calibrated && (
              <p className="mt-2 text-xs text-slate-500 tabular-nums leading-relaxed">
                Titik awal pukul {fmtTime(baseline.at)}
                <br />
                Roll {baseline.roll.toFixed(1)}° · Pitch {baseline.pitch.toFixed(1)}° · Yaw {baseline.yaw.toFixed(1)}°
                <br />
                {baseline.ppg
                  ? `Detak jantung ${Math.round(baseline.ppg.hrBpm)} bpm`
                  : 'Detak jantung: menunggu pembacaan valid…'}
              </p>
            )}
          </div>

          <button
            onClick={onRecalibrate}
            disabled={!live}
            className="self-start inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white border border-[#c9d9f2]
                       text-sm font-semibold text-[var(--vg-tab-active)] hover:bg-[var(--vg-blue-soft)] cursor-pointer transition-colors
                       disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
          >
            {calibrated ? 'Rekalibrasi' : 'Kalibrasi'}
          </button>
        </div>

        <div className="rounded-xl overflow-hidden border border-[#dbe6f7] h-[clamp(240px,24vw,340px)]">
          <ImuVisualizer roll={roll} pitch={pitch} yaw={yaw} />
        </div>
      </div>
    </Card>
  )
}
