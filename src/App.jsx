// ─────────────────────────────────────────────
//  App.jsx  –  top-level (HSM version)
//  The firmware owns the state; this file only picks a screen:
//    g.screen 'BASELINE'  → BaselineWizard   (everything else locked)
//             'CHECK'     → CheckModeScreen  (2-min measurement, locked)
//             'DASHBOARD' → live dashboard / Data Riwayat
//  Offline never unmounts anything: a banner is added and the last values stay.
// ─────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useGlassesSession } from './hooks/useGlassesSession'
import { useNotifications } from './hooks/useNotifications'
import { useSafeDistanceTimer } from './hooks/useSafeDistanceTimer'
import { useDesktopAlerts } from './hooks/useDesktopAlerts'
import { useSessionRecorder } from './hooks/useSessionRecorder'
import { isBaselineStale } from './services/baselineStore'
import { LINK } from './services/bleService'
import { GLASSES_STATE } from './services/bleConfig'
import { WORK } from './services/glassesMachine'
import { initDb, dbHealth } from './services/db/db'
import { StatusCard } from './components/StatusCard'
import { TofReadings } from './components/TofReadings'
import { PostureCard, POSTURE_LIMIT_DEG } from './components/PostureCard'
import { GlassesControls } from './components/GlassesControls'
import { OfflineBanner, CheckPrompt, BaselineBanner, SessionEndedBanner } from './components/SessionOverlays'
import { BaselineWizard } from './components/BaselineWizard'
import { CheckModeScreen } from './components/CheckModeScreen'
import { NotificationPanel } from './components/NotificationPanel'
import { HistoryPage } from './components/history/HistoryPage'
import { HistoryTopBar } from './components/history/HistoryTopBar'

const wrap180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180

// TODO(firmware): confirm real ToF status strings. Only fault-like text is shown as a sensor error.
const TOF_FAULT = /ERR|FAIL|FAULT|TIMEOUT|OUT_OF_RANGE|INVALID/i
const SAFE_DISTANCE_CM = 40

function Frame({ tab, onNavigate, notifications, status, banner, sidebar = true, children }) {
  return (
    <div className="min-h-svh flex flex-col bg-page text-left">
      <HistoryTopBar tab={tab} onNavigate={onNavigate} notifications={notifications} status={status} />
      {banner}
      <div className="flex flex-1 min-w-0">
        <div className="flex flex-1 min-w-0 flex-col lg:flex-row">
          <main className="flex-1 min-w-0 flex flex-col gap-5 p-4 md:p-6">{children}</main>
          {sidebar && <NotificationPanel items={notifications} />}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [dbReady, setDbReady] = useState(false)
  const [tab, setTab] = useState('home')
  const [simulate, setSimulate] = useState(false)
  const [asking, setAsking] = useState(false)

  const [dbError, setDbError] = useState(null)

  useEffect(() => {
    initDb()
      .then(() => dbHealth())
      .then((h) => { if (!h.ok) console.warn('DB health:', h); setDbReady(true) })
      .catch((err) => { console.error('initDb failed:', err); setDbError(err?.message || String(err)) })
  }, [])

  const g = useGlassesSession({ simulate })
  const { s } = g

  // ── derived state ──
  const online = s.link === LINK.ONLINE
  const inWork = s.fw === GLASSES_STATE.WORK_MODE
  const live = online && inWork && !s.sessionEnded          // drives timers + alerts
  const locked = g.screen !== 'DASHBOARD'

  const distanceCm = g.tof?.distanceCm ?? 0
  const tofView = { distanceCm, status: g.tof && TOF_FAULT.test(g.tof.status) ? g.tof.status : 'OK' }
  const showWork = inWork && g.tof != null                   // keep last values while offline
  const { seconds: safeSeconds } = useSafeDistanceTimer(distanceCm, live)

  const basePitch = s.baseline?.posture?.pitchDeg ?? null
  const pitchDev = g.imu && basePitch != null ? wrap180(g.imu.pitchDeg - basePitch) : null
  const badPosture = live && pitchDev != null && Math.abs(pitchDev) > POSTURE_LIMIT_DEG

  const outcome = s.check.outcome
  const checkStatus = outcome?.status ?? null
  const baselineStale = isBaselineStale(s.baseline)

  const notifications = useNotifications({
    live: online,
    fhpStatus: badPosture ? 'POOR_POSTURE' : 'NORMAL',
    checkStatus,
    ppgAlert: null,
  })

  // database persistence (sessions, IMU/ToF readings, checks, daily baselines)
  useSessionRecorder({
    enabled: g.enabled,
    link: s.link,
    fw: s.fw,
    simulate,
    imu: g.imu,
    tof: g.tof,
    fhpStatus: badPosture ? 'POOR_POSTURE' : 'NORMAL',
    outcome,
    baseline: s.baseline,
    workDurationS: s.work.timerS,
    sessionEnded: s.sessionEnded,
  })

  useDesktopAlerts({
    live,
    distanceCm,
    badPosture,
    imuDeviation: pitchDev == null ? null : Math.abs(pitchDev),
    promptOpen: s.work.prompt,
    checkStatus,
  })

  if (dbError) {
    return (
      <div className="p-6 max-w-xl">
        <h1 className="text-2xl m-0 mb-2">Database tidak bisa dibuka</h1>
        <p className="text-sm text-danger font-mono">{dbError}</p>
        <p className="text-sm text-ink-muted">Riwayat tidak bisa disimpan atau dibaca. Periksa izin plugin SQL pada aplikasi, lalu mulai ulang.</p>
      </div>
    )
  }
  if (!dbReady) return <p className="p-6">Memuat…</p>

  const status = online
    ? simulate ? { label: 'Mode simulasi', tone: 'sim' } : { label: 'Terhubung', tone: 'on' }
    : { label: g.enabled ? 'Mencari kacamata…' : 'Tidak terhubung', tone: 'off' }

  const banner = g.enabled && g.offline ? <OfflineBanner searching /> : null
  const controls = <GlassesControls g={g} simulate={simulate} onSimulate={setSimulate} />
  const noNav = () => {}   // locked screens: tabs do nothing

  // ── STATE A / C: locked screens ──
  if (g.screen === 'BASELINE' || g.screen === 'CHECK') {
    return (
      <Frame tab="home" onNavigate={noNav} notifications={notifications} status={status} banner={banner} sidebar={false}>
        <div className="flex justify-end">{controls}</div>
        {g.screen === 'BASELINE' ? <BaselineWizard g={g} /> : <CheckModeScreen g={g} />}
      </Frame>
    )
  }

  // ── Data Riwayat ──
  if (tab === 'history') {
    return (
      <HistoryPage
        onNavigate={setTab}
        notifications={notifications}
        connected={online && !simulate}
        simulating={online && simulate}
      />
    )
  }

  // ── STATE B: dashboard ──
  // "Cek kondisi sekarang": any time, no Timer_D wait. Needs a baseline, a live link and a running session.
  const canCheck = !!s.baseline && online && !s.sessionEnded && s.fw === 'WORK_MODE'
  const checkHint = s.sessionEnded ? 'Sesi dihentikan.'
    : !online ? 'Hubungkan kacamata untuk mengukur.'
    : baselineStale ? `Akan dibandingkan dengan baseline tanggal ${s.baseline.dateKey}.`
    : null
  const answerYes = async () => {
    setAsking(true)
    try { await g.session.answerPrompt(true) } finally { setAsking(false) }
  }

  return (
    <Frame tab="home" onNavigate={setTab} notifications={notifications} status={status} banner={banner}>
      <section className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="m-0 text-2xl md:text-[28px] font-extrabold tracking-tight">Beranda</h1>
          <p className="mt-1 text-sm text-ink-muted">Pantauan langsung sensor VisioGuard.</p>
        </div>
        {controls}
      </section>

      {s.sessionEnded && <SessionEndedBanner onStart={() => g.session.startSession()} />}
      {!s.sessionEnded && baselineStale && (
        <BaselineBanner hasOld={!!s.baseline} disabled={g.offline} onStart={() => g.session.startRebase()} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5">
        <div className="flex flex-col gap-5">
          <StatusCard connected={online && !simulate} simulating={online && simulate} battery={undefined} />
          <TofReadings
            tof={tofView}
            live={showWork}
            safe={showWork ? distanceCm >= SAFE_DISTANCE_CM : null}
            safeSeconds={safeSeconds}
          />
        </div>
        <PostureCard
          show={inWork && g.imu != null}
          offline={g.offline}
          pitchDev={pitchDev}
          basePitch={basePitch}
          timerS={s.work.timerS}
          promptAfterS={g.session.cfg.promptAfterS ?? WORK.PROMPT_AFTER_S}
          ended={s.sessionEnded}
          onCheck={() => g.session.startCheck()}
          checkDisabled={!canCheck}
          checkHint={checkHint}
          onBaseline={s.sessionEnded ? null : () => g.session.startRebase()}
        />
      </div>

      <CheckPrompt
        open={s.work.prompt}
        pending={asking}
        error={g.error}
        offline={g.offline}
        timerS={s.work.timerS}
        onYes={answerYes}
        onNo={() => g.session.answerPrompt(false)}
      />
    </Frame>
  )
}

export default App
