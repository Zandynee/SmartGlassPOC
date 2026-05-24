// ─────────────────────────────────────────────
//  useImu.js  –  React hook
//  Owns all sensor state (IMU, ToF, PPG), the
//  simulation timer, and the Web Bluetooth BLE
//  connection to SmartGlasses firmware.
//  Components receive data + callbacks only.
// ─────────────────────────────────────────────

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  BLE_DEVICE_NAME,
  BLE_SERVICE_UUID,
  BLE_CHAR_IMU_UUID,
  BLE_CHAR_TOF_UUID,
  BLE_CHAR_PPG_UUID,
  DEFAULT_IMU,
  DEFAULT_TOF,
  DEFAULT_PPG,
  computeAngles,
  integrateYaw,
  nextSimulatedFrame,
  nextSimulatedTof,
  nextSimulatedPpg,
  parseBleImu,
  parseBleTof,
  parseBlePpg,
} from '../services/imuService'

// Helper: decode a BLE DataView to a UTF-8 string
const decodeValue = (value) => new TextDecoder().decode(value)

export function useImu() {
  const [imu, setImu]               = useState(DEFAULT_IMU)
  const [tof, setTof]               = useState(DEFAULT_TOF)
  const [ppg, setPpg]               = useState(DEFAULT_PPG)
  const [simulating, setSimulating] = useState(false)
  const [connected, setConnected]   = useState(false)

  // Firmware-reported pitch override (null = use software fallback).
  const [pitchOverride, setPitchOverride] = useState(null)
  const [yaw, setYaw]                     = useState(0)

  // Human-readable error string, or null when healthy.
  const [bleError, setBleError] = useState(null)

  const simIntervalRef = useRef(null)   // IMU simulation setInterval
  const tofIntervalRef = useRef(null)   // ToF simulation setInterval
  const ppgIntervalRef = useRef(null)   // PPG simulation setInterval
  const bleDeviceRef   = useRef(null)   // BluetoothDevice

  // Mirror refs so interval/BLE callbacks always read the latest value
  // without stale closures.
  const imuRef = useRef(DEFAULT_IMU)
  const tofRef = useRef(DEFAULT_TOF)
  const ppgRef = useRef(DEFAULT_PPG)
  const yawRef = useRef(0)

  // ── BLE yaw integration ───────────────────
  // When connected, we integrate yaw from firmware gyro at ~10 Hz
  // (matching INTERVAL_IMU_MS = 500 ms → dt = 0.5 s).
  const BLE_IMU_DT = 0.5  // seconds; must match firmware INTERVAL_IMU_MS / 1000

  // ── simulation controls ───────────────────

  const startSimulation = useCallback(() => {
    if (simIntervalRef.current) return
    yawRef.current = 0
    setYaw(0)

    // IMU @ 100 ms
    simIntervalRef.current = setInterval(() => {
      const next      = nextSimulatedFrame(imuRef.current)
      const newYaw    = integrateYaw(yawRef.current, next.gyro.z, 0.1)
      const { pitch } = computeAngles(next.accel)
      const frame     = {
        ...next,
        fhpStatus: Math.abs(pitch) > 15 ? 'POOR_POSTURE' : 'NORMAL',
      }

      imuRef.current = frame
      yawRef.current = newYaw

      setImu(frame)
      setYaw(newYaw)
    }, 100)

    // ToF @ 500 ms
    tofIntervalRef.current = setInterval(() => {
      const next = nextSimulatedTof(tofRef.current)
      tofRef.current = next
      setTof(next)
    }, 500)

    // PPG @ 5 s
    ppgIntervalRef.current = setInterval(() => {
      const next = nextSimulatedPpg(ppgRef.current)
      ppgRef.current = next
      setPpg(next)
    }, 5000)

    setSimulating(true)
  }, [])

  const stopSimulation = useCallback(() => {
    ;[simIntervalRef, tofIntervalRef, ppgIntervalRef].forEach((r) => {
      if (r.current) { clearInterval(r.current); r.current = null }
    })
    setSimulating(false)
  }, [])

  const toggleSimulation = useCallback(() => {
    if (connected) return
    simulating ? stopSimulation() : startSimulation()
  }, [connected, simulating, startSimulation, stopSimulation])

  // ── Web Bluetooth connection ──────────────

  const connectBLE = useCallback(async () => {
    if (!navigator.bluetooth) {
      setBleError('Web Bluetooth API not supported. Use Chrome or Edge (desktop) on https or localhost.')
      return
    }

    try {
      setBleError(null)

      const device = await navigator.bluetooth.requestDevice({
        filters:          [{ name: BLE_DEVICE_NAME }],
        optionalServices: [BLE_SERVICE_UUID],
      })

      bleDeviceRef.current = device

      device.addEventListener('gattserverdisconnected', () => {
        setBleError('BLE device disconnected unexpectedly.')
        setConnected(false)
        setPitchOverride(null)
      })

      const server  = await device.gatt.connect()
      const service = await server.getPrimaryService(BLE_SERVICE_UUID)

      stopSimulation()
      setConnected(true)
      setPitchOverride(null)
      setYaw(0)
      yawRef.current = 0

      // ── Subscribe to IMU notifications ──
      const imuChar = await service.getCharacteristic(BLE_CHAR_IMU_UUID)
      await imuChar.startNotifications()
      imuChar.addEventListener('characteristicvaluechanged', (e) => {
        const parsed = parseBleImu(decodeValue(e.target.value))
        if (!parsed) return

        // Integrate yaw from firmware gyro Z at BLE_IMU_DT interval
        const newYaw = integrateYaw(yawRef.current, parsed.gyro.z, BLE_IMU_DT)
        yawRef.current = newYaw
        setYaw(newYaw)

        // Merge firmware accel + gyro + fhpStatus into existing state (keeps mag).
        const frame = {
          ...imuRef.current,
          accel:     parsed.accel,
          gyro:      parsed.gyro,      // ← now merged so gyro display is live
          fhpStatus: parsed.fhpStatus,
        }
        imuRef.current = frame
        setImu(frame)
        setPitchOverride(parsed.pitch)
      })

      // ── Subscribe to ToF notifications ──
      const tofChar = await service.getCharacteristic(BLE_CHAR_TOF_UUID)
      await tofChar.startNotifications()
      tofChar.addEventListener('characteristicvaluechanged', (e) => {
        const parsed = parseBleTof(decodeValue(e.target.value))
        if (!parsed) return
        tofRef.current = parsed
        setTof(parsed)
      })

      // ── Subscribe to PPG notifications ──
      const ppgChar = await service.getCharacteristic(BLE_CHAR_PPG_UUID)
      await ppgChar.startNotifications()
      ppgChar.addEventListener('characteristicvaluechanged', (e) => {
        const parsed = parseBlePpg(decodeValue(e.target.value))
        if (!parsed) return
        ppgRef.current = parsed
        setPpg(parsed)
      })

    } catch (err) {
      if (err.name !== 'NotFoundError') {
        setBleError(err.message)
      }
    }
  }, [stopSimulation])

  const disconnectBLE = useCallback(async () => {
    try {
      if (bleDeviceRef.current?.gatt?.connected) {
        bleDeviceRef.current.gatt.disconnect()
      }
    } catch {
      // Ignore – device may already be gone.
    }
    bleDeviceRef.current = null
    setConnected(false)
    setPitchOverride(null)
  }, [])

  const toggleConnection = useCallback(() => {
    connected ? disconnectBLE() : connectBLE()
  }, [connected, connectBLE, disconnectBLE])

  // ── reset ─────────────────────────────────

  const reset = useCallback(() => {
    stopSimulation()
    disconnectBLE()
    imuRef.current = DEFAULT_IMU
    tofRef.current = DEFAULT_TOF
    ppgRef.current = DEFAULT_PPG
    yawRef.current = 0
    setImu(DEFAULT_IMU)
    setTof(DEFAULT_TOF)
    setPpg(DEFAULT_PPG)
    setPitchOverride(null)
    setYaw(0)
    setBleError(null)
    setConnected(false)
  }, [stopSimulation, disconnectBLE])

  // ── derived orientation ───────────────────
  // Roll is always derived from accel (firmware doesn't transmit it directly).
  // Pitch uses the firmware value when connected, otherwise computed from accel.

  const { roll, pitch: softPitch } = computeAngles(imu.accel)
  const pitch = pitchOverride !== null ? pitchOverride : softPitch

  return {
    imu, tof, ppg,
    roll, pitch, yaw,
    simulating,
    connected,
    bleError,
    toggleSimulation,
    toggleConnection,
    reset,
    /** Inject an external IMU frame directly (WebSocket, etc.) */
    setImu: (frame) => { imuRef.current = frame; setImu(frame) },
  }
}