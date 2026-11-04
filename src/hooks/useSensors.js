// ─────────────────────────────────────────────
//  useSensors.js  –  root orchestrator hook
//
//  Composes the three per-sensor hooks and owns
//  the native BLE connection lifecycle (Tauri + btleplug).
//  Components receive data + callbacks only.
//
//  Per-sensor hooks:
//    useImuSensor  → IMU state, sim, BLE handler
//    useTofSensor  → ToF state, sim, BLE handler
//    usePpgSensor  → PPG state, sim, BLE handler
//
//  BLE flow:
//    invoke('ble_connect')  → Rust scans, connects, subscribes
//    listen('ble-imu' | 'ble-tof' | 'ble-ppg') → JSON strings from firmware
//    listen('ble-status')   → 'connected' | 'disconnected'
// ─────────────────────────────────────────────
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { computeAngles } from '../services/imuService'
import { useState, useRef, useCallback, useEffect } from 'react'
import { resetPpgBuffer } from '../services/ppgService'
import { useImuSensor } from './useImuSensor'
import { useTofSensor } from './useTofSensor'
import { usePpgSensor } from './usePpgSensor'
import { startSession, endSession, insertImuReading, insertPpgReading, insertTofReading } from '../services/db/sessions'

export function useSensors() {
  const [simulating, setSimulating] = useState(false)
  const [connected,  setConnected]  = useState(false)
  const [bleError,   setBleError]   = useState(null)
  const [connecting, setConnecting] = useState(false)   // BLE scan/connect in progress

  const sessionIdRef = useRef(null)
  const writeIntervalRef = useRef(null)
  // True while WE are tearing the connection down, so the Rust
  // "disconnected" event isn't reported as an unexpected drop.
  const userDisconnectRef = useRef(false)

  // ── Per-sensor hooks ──────────────────────

  const imuSensor = useImuSensor()
  const tofSensor = useTofSensor()
  const ppgSensor = usePpgSensor()

  // Latest-value ref so the BLE event listeners can be registered ONCE
  // yet always call the newest handlers (avoids re-subscribing every render).
  const latestRef = useRef({})
  latestRef.current = { imuSensor, tofSensor, ppgSensor }

  // ── Persistence (define BEFORE anything that calls it) ──

  const persistGenRef = useRef(0)   // bumped on every begin/end; lets stale async calls bail out

  const beginPersistence = useCallback(async (mode) => {
    clearInterval(writeIntervalRef.current)
    writeIntervalRef.current = null
    const gen = ++persistGenRef.current

    let id
    try {
      id = await startSession(mode)
    } catch (err) {
      console.error('startSession failed:', err)
      setBleError('Database error: could not start a recording session.')
      return
    }

    // A newer begin/end happened while we were awaiting → this session is obsolete.
    if (gen !== persistGenRef.current) {
      endSession(id).catch(() => {})
      return
    }
    sessionIdRef.current = id

    writeIntervalRef.current = setInterval(async () => {
      const sid = sessionIdRef.current
      if (!sid) {
        console.warn('Persistence tick skipped: no session id')
        return
      }
      try {
        const currentImu = imuSensor.imuRef.current
        const { roll, pitch } = computeAngles(currentImu.accel)
        await insertImuReading(sid, { ...currentImu, roll, pitch, yaw: imuSensor.yawRef.current })
        await insertPpgReading(sid, { ...ppgSensor.ppgRef.current })
        await insertTofReading(sid, { ...tofSensor.tofRef.current })
      } catch (err) {
        console.error('Persistence write failed:', err)
      }
    }, 500)
  }, [imuSensor, ppgSensor, tofSensor])

  const endPersistence = useCallback(async () => {
    persistGenRef.current++                 // invalidate any in-flight beginPersistence
    clearInterval(writeIntervalRef.current)
    writeIntervalRef.current = null
    const id = sessionIdRef.current
    sessionIdRef.current = null
    if (id) {
      try { await endSession(id) } catch (err) { console.error('endSession failed:', err) }
    }
  }, [])

  // ── Simulation ────────────────────────────

  const startSimulation = useCallback(() => {
    imuSensor.startSim()
    tofSensor.startSim()
    ppgSensor.startSim()
    setSimulating(true)
    beginPersistence('simulate')
  }, [imuSensor, tofSensor, ppgSensor, beginPersistence])

  const stopSimulation = useCallback(() => {
    imuSensor.stopSim()
    tofSensor.stopSim()
    ppgSensor.stopSim()
    setSimulating(false)
    endPersistence()
  }, [imuSensor, tofSensor, ppgSensor, endPersistence])

  const toggleSimulation = useCallback(() => {
    if (connected || connecting) return
    simulating ? stopSimulation() : startSimulation()
  }, [connected, connecting, simulating, startSimulation, stopSimulation])

  // ── Native BLE event listeners (registered once) ──

  useEffect(() => {
    let disposed = false
    const unlisteners = []

    const register = async (event, handler) => {
      const unlisten = await listen(event, handler)
      if (disposed) unlisten()          // effect already cleaned up
      else unlisteners.push(unlisten)
    }

    register('ble-imu', (e) => latestRef.current.imuSensor.handleBleValue(e.payload))
    register('ble-tof', (e) => latestRef.current.tofSensor.handleBleValue(e.payload))
    register('ble-ppg', (e) => latestRef.current.ppgSensor.handleBleValue(e.payload))
    register('ble-status', (e) => {
      if (e.payload === 'disconnected' && !userDisconnectRef.current) {
        const { imuSensor: imu } = latestRef.current
        setBleError('BLE device disconnected unexpectedly.')
        setConnected(false)
        imu.setPitchOverride(null)
        resetPpgBuffer()
        endPersistence()
      }
    })

    return () => {
      disposed = true
      unlisteners.forEach((f) => f())
    }
  }, [endPersistence])

  // ── Native BLE connection ─────────────────

  const connectBLE = useCallback(async () => {
    setConnecting(true)
    try {
      setBleError(null)
      userDisconnectRef.current = false

      // Rust scans (~8s), connects, subscribes, then emits 'ble-status: connected'.
      await invoke('ble_connect')

      stopSimulation()
      setConnected(true)
      imuSensor.setPitchOverride(null)
      imuSensor.yawRef.current = 0
      await beginPersistence('ble')
    } catch (err) {
      setBleError(typeof err === 'string' ? err : err?.message ?? 'BLE connection failed.')
    } finally {
      setConnecting(false)
    }
  }, [imuSensor, stopSimulation, beginPersistence])

  const disconnectBLE = useCallback(async () => {
    userDisconnectRef.current = true
    try {
      await invoke('ble_disconnect')
    } catch {
      // Device may already be gone.
    }
    setConnected(false)
    imuSensor.setPitchOverride(null)
    resetPpgBuffer()
    await endPersistence()
  }, [imuSensor, endPersistence])

  const toggleConnection = useCallback(() => {
    if (connecting) return
    connected ? disconnectBLE() : connectBLE()
  }, [connected, connecting, connectBLE, disconnectBLE])

  // ── Full reset ────────────────────────────

  const reset = useCallback(() => {
    stopSimulation()
    disconnectBLE()
    imuSensor.reset()
    tofSensor.reset()
    ppgSensor.reset()
    setBleError(null)
    setConnected(false)
  }, [stopSimulation, disconnectBLE, imuSensor, tofSensor, ppgSensor])

  // ── Public API ────────────────────────────

  return {
    imu: imuSensor.imu,
    tof: tofSensor.tof,
    ppg: ppgSensor.ppg,
    roll:  imuSensor.roll,
    pitch: imuSensor.pitch,
    yaw:   imuSensor.yaw,
    simulating,
    connected,
    connecting,
    bleError,
    toggleSimulation,
    toggleConnection,
    reset,
    setImu: imuSensor.setImu,
  }
}