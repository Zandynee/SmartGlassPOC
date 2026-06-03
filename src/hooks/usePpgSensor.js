// ─────────────────────────────────────────────
//  usePpgSensor.js  –  PPG sensor hook
//  Owns PPG state, the oscilloscope display
//  buffer feed (20 ms), and the state-tick
//  simulation interval (100 ms).
//
//  Consumed by useSensors.js (the root orchestrator).
// ─────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react'
import {
  DEFAULT_PPG,
  nextSimulatedPpg,
  pushSimulatedIrSample,
  parseBlePpg,
  resetPpgBuffer,
} from '../services/ppgService'

export function usePpgSensor() {
  const [ppg, setPpgState] = useState(DEFAULT_PPG)

  const ppgRef       = useRef(DEFAULT_PPG)
  const simRef       = useRef(null)   // 100 ms PPG state-tick interval
  const irDisplayRef = useRef(null)   // 20 ms oscilloscope feed interval

  /** Write ppg state to both ref + React state. */
  const setPpg = useCallback((reading) => {
    ppgRef.current = reading
    setPpgState(reading)
  }, [])

  // ── Simulation ──────────────────────────────

  const startSim = useCallback(() => {
    if (simRef.current) return
    resetPpgBuffer()

    // PPG state tick @ 100 ms — updates BPM / fatigue
    simRef.current = setInterval(() => {
      const next = nextSimulatedPpg(ppgRef.current)
      ppgRef.current = next
      setPpgState(next)
    }, 100)

    // Oscilloscope display buffer @ 20 ms — smooth waveform
    irDisplayRef.current = setInterval(() => {
      pushSimulatedIrSample(ppgRef.current.hrBpm || 75)
    }, 20)
  }, [])

  const stopSim = useCallback(() => {
    if (simRef.current) {
      clearInterval(simRef.current)
      simRef.current = null
    }
    if (irDisplayRef.current) {
      clearInterval(irDisplayRef.current)
      irDisplayRef.current = null
    }
  }, [])

  // ── BLE notification handler ─────────────────

  /**
   * Feed a raw BLE characteristic value (TextDecoder output) into the hook.
   * parseBlePpg() handles everything: pushes to both the HR detection buffer
   * AND the display buffer (pushIrToDisplay), then returns the full PPG state.
   * Returns false if parsing fails.
   */
  const handleBleValue = useCallback((text) => {
    const parsed = parseBlePpg(text)
    if (!parsed) return false
    ppgRef.current = parsed
    setPpgState(parsed)
    return true
  }, [])

  // ── Reset ────────────────────────────────────

  const reset = useCallback(() => {
    stopSim()
    ppgRef.current = DEFAULT_PPG
    setPpgState(DEFAULT_PPG)
    resetPpgBuffer()
  }, [stopSim])

  return {
    ppg,
    ppgRef,
    setPpg,
    startSim,
    stopSim,
    handleBleValue,
    reset,
  }
}