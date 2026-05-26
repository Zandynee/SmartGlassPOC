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
  pushSimulatedIrSample,   // ← NEW: feeds display buffer at 50 ms
  parseBleImu,
  parseBleTof,
  parseBlePpg,
  resetPpgBuffer,
} from '../services/imuService'

const decodeValue = (value) => new TextDecoder().decode(value)

export function useImu() {
  const [imu, setImu]               = useState(DEFAULT_IMU)
  const [tof, setTof]               = useState(DEFAULT_TOF)
  const [ppg, setPpg]               = useState(DEFAULT_PPG)
  const [simulating, setSimulating] = useState(false)
  const [connected, setConnected]   = useState(false)

  const [pitchOverride, setPitchOverride] = useState(null)
  const [yaw, setYaw]                     = useState(0)
  const [bleError, setBleError]           = useState(null)

  const simIntervalRef   = useRef(null)   // IMU  simulation (100 ms)
  const tofIntervalRef   = useRef(null)   // ToF  simulation (200 ms)
  const ppgIntervalRef   = useRef(null)   // PPG  simulation (400 ms)
  const irDisplayRef     = useRef(null)   // IR display buffer feed (50 ms)
  const bleDeviceRef     = useRef(null)   // BluetoothDevice

  const imuRef = useRef(DEFAULT_IMU)
  const tofRef = useRef(DEFAULT_TOF)
  const ppgRef = useRef(DEFAULT_PPG)
  const yawRef = useRef(0)

  const BLE_IMU_DT = 0.02  // seconds; matches firmware INTERVAL_IMU_MS / 1000

  // ── simulation controls ───────────────────

  const startSimulation = useCallback(() => {
    if (simIntervalRef.current) return
    yawRef.current = 0
    setYaw(0)
    resetPpgBuffer()

    // IMU @ 20 ms
    simIntervalRef.current = setInterval(() => {
      const next      = nextSimulatedFrame(imuRef.current)
      const newYaw    = integrateYaw(yawRef.current, next.gyro.z, 0.02)
      const { pitch } = computeAngles(next.accel)
      const frame     = {
        ...next,
        fhpStatus: Math.abs(pitch) > 15 ? 'POOR_POSTURE' : 'NORMAL',
      }

      imuRef.current = frame
      yawRef.current = newYaw

      setImu(frame)
      setYaw(newYaw)
    }, 20)

    // ToF @ 50 ms
    tofIntervalRef.current = setInterval(() => {
      const next = nextSimulatedTof(tofRef.current)
      tofRef.current = next
      setTof(next)
    }, 50)

    // PPG @ 100 ms — updates BPM / fatigue state
    ppgIntervalRef.current = setInterval(() => {
      const next = nextSimulatedPpg(ppgRef.current)
      ppgRef.current = next
      setPpg(next)
    }, 100)

    // IR display @ 20 ms — feeds the oscilloscope display buffer
    // with a ppg-shaped waveform paced to the current simulated BPM.
    irDisplayRef.current = setInterval(() => {
      pushSimulatedIrSample(ppgRef.current.hrBpm || 75)
    }, 20)

    setSimulating(true)
  }, [])

  const stopSimulation = useCallback(() => {
    ;[simIntervalRef, tofIntervalRef, ppgIntervalRef, irDisplayRef].forEach((r) => {
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
        resetPpgBuffer()
      })

      const server  = await device.gatt.connect()
      const service = await server.getPrimaryService(BLE_SERVICE_UUID)

      stopSimulation()
      setConnected(true)
      setPitchOverride(null)
      setYaw(0)
      yawRef.current = 0
      resetPpgBuffer()

      // ── IMU notifications ──
      const imuChar = await service.getCharacteristic(BLE_CHAR_IMU_UUID)
      await imuChar.startNotifications()
      imuChar.addEventListener('characteristicvaluechanged', (e) => {
        const parsed = parseBleImu(decodeValue(e.target.value))
        if (!parsed) return

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
        setImu(frame)
        setPitchOverride(parsed.pitch)
      })

      // ── ToF notifications ──
      const tofChar = await service.getCharacteristic(BLE_CHAR_TOF_UUID)
      await tofChar.startNotifications()
      tofChar.addEventListener('characteristicvaluechanged', (e) => {
        const parsed = parseBleTof(decodeValue(e.target.value))
        if (!parsed) return
        tofRef.current = parsed
        setTof(parsed)
      })

      // ── PPG notifications ──
      // parseBlePpg handles everything: pushes to both the HR detection buffer
      // AND the display buffer (pushIrToDisplay), then returns the full PPG state.
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
      // Device may already be gone.
    }
    bleDeviceRef.current = null
    setConnected(false)
    setPitchOverride(null)
    resetPpgBuffer()
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
    resetPpgBuffer()
  }, [stopSimulation, disconnectBLE])

  // ── derived orientation ───────────────────

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
    setImu: (frame) => { imuRef.current = frame; setImu(frame) },
  }
}