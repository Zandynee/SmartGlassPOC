// ─────────────────────────────────────────────
//  BaselineWizard.jsx  –  STATE A · baseline (dashboard is locked)
//
//  0  Fitness question 1–5 (before the baseline)
//  1  When a baseline already exists: choose per part, "Buat baru" or "Pakai yang ada"
//     (HRV and posture are chosen separately, e.g. keep the posture, redo the HRV).
//     Glasses lying still on the table, fingertip on the temple sensor:
//     6 × 60 s windows. Valid when >= 5 windows pass the quality gate;
//     RMSSD / SDNN baseline = median of the valid windows.
//  2  Glasses ON, sit upright → ~5 s of IMU pitch = "straight" reference
//  Then the baseline is stored locally and the app sends cmd 1 (WORK_MODE).
//  The baseline is refreshed daily (see "rebase" in glassesSession).
//
//  Props: g = result of useGlassesSession()
//  UI text: Indonesian (handoff §6.2). Not tested with users yet.
// ─────────────────────────────────────────────

import { Card } from './Card'
import { CheckIcon } from './icons'
import { Btn } from './Btn'
import { WindowDots } from './WindowDots'
import { PpgScope } from './PpgScope'
import { RingProgress } from './RingProgress'
import { STEP, selectWizPart, selectWizProgress, selectWizBlocked } from '../services/glassesMachine'
import { hasContact } from '../services/glassesSession'
import { BASELINE_FAILED, FITNESS_LEVELS, causeText, validText, NOT_MEDICAL } from '../services/measureMessages'

const POSTURE_ERRORS = {
  moved: 'Anda terlalu banyak bergerak. Duduk tegak, lihat ke depan dan tahan diam.',
  too_few: 'Data postur belum cukup. Periksa koneksi lalu coba lagi.',
}

function Part({ n, active, done, children }) {
  return (
    <div className={`flex items-center gap-2 text-sm font-semibold ${active ? 'text-brand-strong' : done ? 'text-ok' : 'text-ink-muted'}`}>
      <span className={`size-step rounded-full grid place-items-center text-xs text-white ${active ? 'bg-primary' : done ? 'bg-ok-solid' : 'bg-ink-ghost'}`}>
        {done ? <CheckIcon size={12} /> : n}
      </span>
      {children}
    </div>
  )
}

function Metric({ label, value, unit }) {
  return (
    <div className="rounded-xl bg-tint border border-line p-3 text-center">
      <div className="text-caption font-semibold text-ink-muted">{label}</div>
      <div className="text-xl font-semibold text-ink-strong tabular-nums">
        {Number.isFinite(value) ? value.toFixed(label === 'HR' ? 0 : 1) : '—'}
        <span className="text-xs font-semibold text-ink-muted ml-1">{unit}</span>
      </div>
    </div>
  )
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s % 60))).padStart(2, '0')}`

export function BaselineWizard({ g }) {
  const { s, session } = g
  const w = s.wiz
  const part = selectWizPart(s)
  const progress = selectWizProgress(s)
  const blocked = selectWizBlocked(s) && !s.rebase
  const contact = hasContact(g.ppg)

  const nWin = session.cfg.baselineWindows
  const totalS = (session.cfg.windowMs / 1000) * nWin
  const postureTotalS = session.cfg.postureMs / 1000
  const saved = s.baseline
  const recordingReady = s.fw === 'BASELINE_CREATION' || s.fw === 'CHECK_MODE'
  const fmtWhen = (ms) => (ms ? new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')

  let body
  if (blocked) {
    body = (
      <Step
        title="Baseline hari ini belum ada"
        text="Kacamata sudah melewati tahap persiapan. Anda bisa membuat baseline sekarang tanpa menyalakan ulang kacamata."
      >
        <Btn disabled={g.offline} onClick={() => session.startRebase()}>Buat baseline</Btn>
        {g.error && <Notice tone="warn">{g.error}</Notice>}
      </Step>
    )
  } else if (!s.fw) {
    body = (
      <Notice title={g.enabled ? 'Mencari kacamata…' : 'Kacamata belum terhubung'}>
        {g.enabled ? 'Nyalakan kacamata dan dekatkan ke komputer ini.' : 'Tekan Hubungkan untuk memulai.'}
      </Notice>
    )
  } else {
    switch (w.step) {
      case STEP.FITNESS:
        body = (
          <Step
            title="Persiapan"
            text="Taruh kacamata di meja datar dan biarkan diam. Duduk tenang, jangan bicara."
          >
            <div className="text-sm font-semibold text-ink-strong">Seberapa bugar Anda hari ini?</div>
            <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Kebugaran 1 sampai 5">
              {FITNESS_LEVELS.map((f) => (
                <button
                  key={f.v}
                  onClick={() => session.answerFitness(f.v)}
                  className="w-24 rounded-xl border border-line bg-white px-2 py-2 text-center hover:bg-wash cursor-pointer"
                >
                  <div className="text-xl font-semibold text-ink-strong">{f.v}</div>
                  <div className="text-caption text-ink-muted leading-tight">{f.label}</div>
                </button>
              ))}
            </div>
          </Step>
        )
        break
      case STEP.CHOOSE_HRV: {
        const h = saved.hrv
        body = (
          <Step title="Baseline HRV" text="Buat pengukuran baru (±6 menit) atau pakai baseline HRV yang sudah tersimpan.">
            <div className="rounded-xl bg-tint border border-line px-4 py-3 text-sm text-ink-soft">
              Tersimpan: {fmtWhen(h.measuredAt ?? saved.createdAt)} · RMSSD {h.rmssd.toFixed(1)} ms · SDNN {h.sdnn.toFixed(1)} ms · {validText(h.validWindows, h.totalWindows)}
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Btn onClick={() => session.chooseHrv('new')}>Buat baru</Btn>
              <Btn kind="secondary" onClick={() => session.chooseHrv('existing')}>Pakai yang ada</Btn>
            </div>
            <button onClick={() => session.useSavedBaseline()} className="text-xs text-ink-muted underline cursor-pointer bg-transparent border-0">
              Pakai semua baseline yang ada (HRV dan postur)
            </button>
          </Step>
        )
        break
      }
      case STEP.CHOOSE_POSTURE: {
        const p = saved.posture
        body = (
          <Step title="Baseline postur" text="Ukur ulang postur tegak Anda (±5 detik, kacamata dipakai) atau pakai yang sudah tersimpan.">
            <div className="rounded-xl bg-tint border border-line px-4 py-3 text-sm text-ink-soft">
              Tersimpan: {fmtWhen(p.measuredAt ?? saved.createdAt)} · sudut tegak {p.pitchDeg.toFixed(1)}°
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              <Btn onClick={() => session.choosePosture('new')}>Buat baru</Btn>
              <Btn kind="secondary" onClick={() => session.choosePosture('existing')}>Pakai yang ada</Btn>
            </div>
          </Step>
        )
        break
      }
      case STEP.FINGER:
        body = (
          <Step
            title="Tempelkan ujung jari telunjuk pada sensor di temple"
            text="Cukup menempel, jangan menekan kuat. Pengukuran mulai sendiri begitu sinyal denyut stabil."
          >
            {!recordingReady
              ? <Signal ok={false} text="Menyiapkan sensor di kacamata…" />
              : <Signal ok={contact} text={contact ? 'Jari terdeteksi – tahan…' : 'Jari belum terdeteksi'} />}
            {recordingReady && <div className="w-full max-w-xl"><PpgScope session={session} contact={contact} /></div>}
            {w.hrvError && (
              <Notice tone="warn" title={w.hrvError === 'link_lost' ? causeText('link_lost').msg : BASELINE_FAILED.msg}>
                {w.hrvError === 'link_lost'
                  ? causeText('link_lost').tip
                  : <>{causeText(w.hrvCause).msg} {BASELINE_FAILED.tip}</>}
                {w.hrvWindows.length > 0 && w.hrvError !== 'link_lost' && (
                  <div className="mt-1 text-xs">{validText(w.hrvWindows.filter((x) => x.ok).length, nWin)}</div>
                )}
              </Notice>
            )}
          </Step>
        )
        break
      case STEP.HRV: {
        const done = w.hrvWindows.length
        const left = totalS * (1 - progress)
        body = (
          <Step title="Mengukur denyut istirahat" text="Jangan menggeser jari, jangan mengetuk meja.">
            <RingProgress value={progress} label={fmtTime(left)} sub="tersisa" />
            <WindowDots total={nWin} windows={w.hrvWindows} progress={progress} />
            <div className="text-caption text-ink-muted">Window {Math.min(nWin, done + 1)} dari {nWin}</div>
            <div className="w-full max-w-xl"><PpgScope session={session} contact={contact} /></div>
            <Signal ok={contact} text={contact ? 'Sinyal bagus' : 'Jari terlepas – tempel lagi'} />
          </Step>
        )
        break
      }
      case STEP.HRV_DONE: {
        const r = w.hrvResult
        body = (
          <Step title="Baseline HRV tersimpan sementara" text={`${validText(r.validWindows, r.totalWindows)}. Sekarang pakai kacamata untuk bagian postur.`}>
            <div className="grid grid-cols-3 gap-3 w-full max-w-md">
              <Metric label="RMSSD" value={r.rmssd} unit="ms" />
              <Metric label="SDNN" value={r.sdnn} unit="ms" />
              <Metric label="HR" value={r.hrBpm} unit="bpm" />
            </div>
            <div className="flex gap-2">
              <Btn onClick={() => session.readyPosture()}>Lanjut</Btn>
              <Btn kind="secondary" onClick={() => session.retryHrv()}>Ulangi</Btn>
            </div>
          </Step>
        )
        break
      }
      case STEP.WEAR:
        body = (
          <Step title="Pakai kacamata dan duduk tegak" text="Lihat lurus ke depan, bahu rileks. Ini menjadi acuan postur baik Anda.">
            {w.postureError && <Notice tone="warn">{POSTURE_ERRORS[w.postureError]}</Notice>}
            <Btn onClick={() => session.readyPosture()} disabled={g.offline}>Saya sudah duduk tegak – mulai</Btn>
          </Step>
        )
        break
      case STEP.POSTURE:
        body = (
          <Step title="Tahan diam…" text="Mengukur postur tegak Anda.">
            <RingProgress value={progress} label={`${Math.ceil(postureTotalS * (1 - progress))}d`} sub="tersisa" />
          </Step>
        )
        break
      case STEP.SAVING:
        body = (
          <Step title="Menyimpan baseline…">
            {w.saveError && (
              <Notice tone="warn" title="Gagal menyimpan">
                {w.saveError} <Btn kind="secondary" onClick={() => session.retrySave()}>Coba lagi</Btn>
              </Notice>
            )}
          </Step>
        )
        break
      case STEP.DONE:
      default:
        body = (
          <Step
            title="Baseline tersimpan"
            text={s.baseline ? `${validText(s.baseline.hrv.validWindows, s.baseline.hrv.totalWindows)}. Memulai mode kerja di kacamata…` : 'Memulai mode kerja di kacamata…'}
          >
            {g.error && <Notice tone="warn">{g.error} – mencoba lagi…</Notice>}
          </Step>
        )
    }
  }

  return (
    <Card title="Buat baseline hari ini" dot="#2563eb" className="max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-6 flex-wrap mb-5">
        <Part n={1} active={part === 1} done={part === 2}>HRV istirahat{w.reuse.hrv ? ' (pakai yang ada)' : ' (kacamata di meja)'}</Part>
        <Part n={2} active={part === 2} done={w.step === STEP.DONE}>Postur{w.reuse.posture ? ' (pakai yang ada)' : ' (kacamata dipakai)'}</Part>
      </div>
      <div className="flex flex-col items-center gap-4 text-center py-4">{body}</div>
      {s.rebase && w.step !== STEP.SAVING && w.step !== STEP.DONE && (
        <div className="flex justify-center mb-2">
          <Btn kind="secondary" onClick={() => session.cancelRebase()}>Batal</Btn>
        </div>
      )}
      <p className="text-xs text-ink-muted m-0 mt-2">
        Dashboard terbuka setelah kedua bagian tersimpan. Data hanya disimpan di komputer ini. {NOT_MEDICAL}
      </p>
    </Card>
  )
}

function Step({ title, text, children }) {
  return (
    <>
      <h3 className="m-0 text-lg font-semibold text-ink-strong">{title}</h3>
      {text && <p className="m-0 text-sm text-ink-muted max-w-md">{text}</p>}
      {children}
    </>
  )
}

function Signal({ ok, text }) {
  return (
    <div className={`inline-flex items-center gap-2 text-sm font-semibold ${ok ? 'text-ok' : 'text-ink-muted'}`}>
      <span className={`size-dot rounded-full ${ok ? 'bg-ok-solid' : 'bg-ink-ghost'}`} />
      {text}
    </div>
  )
}

function Notice({ title, tone = 'info', children }) {
  const c = tone === 'warn' ? 'bg-warning-surface border-warning-line text-warning-deep' : 'bg-info-surface border-info-line text-info-strong'
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm text-left max-w-md ${c}`}>
      {title && <div className="font-medium mb-0.5">{title}</div>}
      {children}
    </div>
  )
}
