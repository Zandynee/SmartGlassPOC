// ─────────────────────────────────────────────
//  useImuSensor.js  –  IMU sensor hook
//  Owns IMU state, yaw integration, and the
//  20 ms simulation interval.
//
//  Consumed by useSensors.js (the root orchestrator).
// ─────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react'
import {
  DEFAULT_IMU,
  computeAngles,
  integrateYaw,
  nextSimulatedFrame,
  parseBleImu,
} from '../services/imuService'

const BLE_IMU_DT = 0.02   // seconds — matches INTERVAL_IMU_MS / 1000 in firmware

export function useImuSensor() {
  const [imu, setImuState]          = useState(DEFAULT_IMU)
  const [yaw, setYaw]               = useState(0)
  const [pitchOverride, setPitchOverride] = useState(null)

  const imuRef = useRef(DEFAULT_IMU)
  const yawRef = useRef(0)
  const simRef = useRef(null)   // 20 ms simulation interval

  /** Write imu state to both ref + React state. */
  const setImu = useCallback((frame) => {
    imuRef.current = frame
    setImuState(frame)
  }, [])

  // ── Simulation ──────────────────────────────

  const startSim = useCallback(() => {
    if (simRef.current) return
    yawRef.current = 0
    setYaw(0)

    simRef.current = setInterval(() => {
      const next      = nextSimulatedFrame(imuRef.current)
      const newYaw    = integrateYaw(yawRef.current, next.gyro.z, 0.02)
      const { pitch } = computeAngles(next.accel)
      const frame     = {
        ...next,
        fhpStatus: Math.abs(pitch) > 15 ? 'POOR_POSTURE' : 'NORMAL',
      }

      imuRef.current = frame
      yawRef.current = newYaw
      setImuState(frame)
      setYaw(newYaw)
    }, 20)
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
    const parsed = parseBleImu(text)
    if (!parsed) return false

    const newYaw = integrateYaw(yawRef.current, parsed.gyro.z, BLE_IMU_DT)
    yawRef.current = newYaw
    setYaw(newYaw)

    const frame = {
      ...imuRef.current,
      accel:     parsed.accel,
      gyro:      parsed.gyro,
      fhpStatus: parsed.fhpStatus,
    }
    imuRef.current = frame
    setImuState(frame)
    setPitchOverride(parsed.pitch)
    return true
  }, [])

  // ── Reset ────────────────────────────────────

  const reset = useCallback(() => {
    stopSim()
    imuRef.current = DEFAULT_IMU
    yawRef.current = 0
    setImuState(DEFAULT_IMU)
    setYaw(0)
    setPitchOverride(null)
  }, [stopSim])

  // ── Derived orientation ──────────────────────

  const { roll, pitch: softPitch } = computeAngles(imu.accel)
  const pitch = pitchOverride !== null ? pitchOverride : softPitch

  return {
    imu,
    roll, pitch, yaw,
    imuRef,
    yawRef,
    setImu,
    setPitchOverride,
    startSim,
    stopSim,
    handleBleValue,
    reset,
  }
}