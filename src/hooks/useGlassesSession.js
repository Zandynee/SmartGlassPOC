// ─────────────────────────────────────────────
//  useGlassesSession.js  –  React binding for services/glassesSession.js
//
//  const g = useGlassesSession({ simulate })
//
//    g.screen    'BASELINE' | 'DASHBOARD' | 'CHECK'
//    g.s         reducer state (link, fw, baseline, wiz, work, check, sessionEnded)
//    g.imu/tof/ppg   latest packets ({pitchDeg,fhpStatus,t} / {distanceCm,status,t} / {ir,red,contactStatus,t})
//    g.offline   true unless the link is ONLINE
//    g.enabled   user pressed Connect (supervisor running → auto-reconnects)
//    g.error     last action/link error text, or null
//    g.sim       SimulatedGlasses instance when simulate=true (test knobs), else null
//    g.session   the controller (call g.session.answerPrompt(true), …)
//
//  Switching `simulate` creates a fresh session (the old one is stopped).
// ─────────────────────────────────────────────

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { GlassesSession } from '../services/glassesSession.js'
import { SimulatedGlasses } from '../services/simulatedGlasses.js'
import { LINK } from '../services/bleService.js'

export function useGlassesSession({ simulate = false, autoStart = false, config } = {}) {
  const { session, sim } = useMemo(() => {
    const sim = simulate ? new SimulatedGlasses() : null
    return { sim, session: new GlassesSession({ api: sim || undefined, config }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulate])

  useEffect(() => {
    if (autoStart) session.start()
    return () => { session.stop() }
  }, [session, autoStart])

  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot)

  return {
    ...snap,
    s: snap.state,
    offline: snap.state.link !== LINK.ONLINE,
    sim,
    session,
    connect: () => session.start(),
    disconnect: () => session.stop(),
  }
}
