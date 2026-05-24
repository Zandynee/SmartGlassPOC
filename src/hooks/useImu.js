// ─────────────────────────────────────────────
//  useImu.js  –  React hook
//  Owns all sensor state (IMU, ToF, PPG), the
//  simulation timer, and the Web Bluetooth BLE
//  connection to SmartGlasses firmware.
//  Components receive data + callbacks only.
// ─────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react'
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
  resetPpgBuffer,
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
  // Disesuaikan dengan INTERVAL_IMU_MS = 100ms → dt = 0.1 s
  const BLE_IMU_DT = 0.1   // seconds; must match firmware INTERVAL_IMU_MS / 1000

  // ── simulation controls ───────────────────

  const startSimulation = useCallback(() => {
    if (simIntervalRef.current) return
    yawRef.current = 0
    setYaw(0)

    // IMU @ 100 ms — sesuai INTERVAL_IMU_MS firmware
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

    // ToF @ 200 ms — sesuai INTERVAL_TOF_MS firmware
    tofIntervalRef.current = setInterval(() => {
      const next = nextSimulatedTof(tofRef.current)
      tofRef.current = next
      setTof(next)
    }, 200)

    // PPG @ 400 ms — sesuai INTERVAL_PPG_MS firmware
    // Mode simulasi langsung hasilkan BPM tanpa buffer IR
    ppgIntervalRef.current = setInterval(() => {
      const next = nextSimulatedPpg(ppgRef.current)
      ppgRef.current = next
      setPpg(next)
    }, 400)

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
        resetPpgBuffer()   // bersihkan buffer IR saat koneksi putus
      })

      const server  = await device.gatt.connect()
      const service = await server.getPrimaryService(BLE_SERVICE_UUID)

      stopSimulation()
      setConnected(true)
      setPitchOverride(null)
      setYaw(0)
      yawRef.current = 0
      resetPpgBuffer()   // bersihkan buffer IR dari sesi sebelumnya

      // ── Subscribe to IMU notifications ──
      const imuChar = await service.getCharacteristic(BLE_CHAR_IMU_UUID)
      await imuChar.startNotifications()
      imuChar.addEventListener('characteristicvaluechanged', (e) => {
        const parsed = parseBleImu(decodeValue(e.target.value))
        if (!parsed) return

        // Integrate yaw dari firmware gyro Z — dt = 0.1 s (100ms interval)
        const newYaw = integrateYaw(yawRef.current, parsed.gyro.z, BLE_IMU_DT)
        yawRef.current = newYaw
        setYaw(newYaw)

        // Merge firmware accel + gyro + fhpStatus ke state (keeps mag).
        const frame = {
          ...imuRef.current,
          accel:     parsed.accel,
          gyro:      parsed.gyro,
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
      // parseBlePpg sudah handle semua: push ke buffer IR,
      // kalkulasi HR, dan kembalikan format {hrBpm, fatigueIndex, fatigueStatus}
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
    resetPpgBuffer()   // bersihkan buffer IR saat disconnect manual
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
    resetPpgBuffer()   // bersihkan buffer IR saat full reset
  }, [stopSimulation, disconnectBLE])

  // ── derived orientation ───────────────────
  // Roll selalu dari accel. Pitch pakai nilai firmware saat connected,
  // fallback ke kalkulasi software saat simulasi.

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
