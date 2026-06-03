// ─────────────────────────────────────────────
//  useTofSensor.js  –  ToF sensor hook
//  Owns ToF state and the 50 ms simulation interval.
//
//  Consumed by useSensors.js (the root orchestrator).
// ─────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react'
import {
  DEFAULT_TOF,
  nextSimulatedTof,
  parseBleTof,
} from '../services/tofService'

export function useTofSensor() {
  const [tof, setTofState] = useState(DEFAULT_TOF)

  const tofRef = useRef(DEFAULT_TOF)
  const simRef = useRef(null)   // 50 ms simulation interval

  /** Write tof state to both ref + React state. */
  const setTof = useCallback((reading) => {
    tofRef.current = reading
    setTofState(reading)
  }, [])

  // ── Simulation ──────────────────────────────

  const startSim = useCallback(() => {
    if (simRef.current) return

    simRef.current = setInterval(() => {
      const next = nextSimulatedTof(tofRef.current)
      tofRef.current = next
      setTofState(next)
    }, 50)
  }, [])

  const stopSim = useCallback(() => {
    if (simRef.current) {
      clearInterval(simRef.current)
      simRef.current = null
    }
  }, [])

  // ── BLE notification handler ─────────────────

  /**
   * Feed a raw BLE characteristic value (TextDecoder output) into the hook.
   * Returns false if parsing fails.
   */
  const handleBleValue = useCallback((text) => {
    const parsed = parseBleTof(text)
    if (!parsed) return false
    tofRef.current = parsed
    setTofState(parsed)
    return true
  }, [])

  // ── Reset ────────────────────────────────────

  const reset = useCallback(() => {
    stopSim()
    tofRef.current = DEFAULT_TOF
    setTofState(DEFAULT_TOF)
  }, [stopSim])

  return {
    tof,
    tofRef,
    setTof,
    startSim,
    stopSim,
    handleBleValue,
    reset,
  }
}