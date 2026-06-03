// ─────────────────────────────────────────────
//  useSensors.js  –  root orchestrator hook
//
//  Composes the three per-sensor hooks and owns
//  the Web Bluetooth BLE connection lifecycle.
//  Components receive data + callbacks only.
//
//  Per-sensor hooks:
//    useImuSensor  → IMU state, sim, BLE handler
//    useTofSensor  → ToF state, sim, BLE handler
//    usePpgSensor  → PPG state, sim, BLE handler
// ─────────────────────────────────────────────

import { useState, useRef, useCallback } from 'react'
import {
  BLE_DEVICE_NAME,
  BLE_SERVICE_UUID,
  BLE_CHAR_IMU_UUID,
  BLE_CHAR_TOF_UUID,
  BLE_CHAR_PPG_UUID,
} from '../services/bleConfig'
import { resetPpgBuffer } from '../services/ppgService'

import { useImuSensor } from './useImuSensor'
import { useTofSensor } from './useTofSensor'
import { usePpgSensor } from './usePpgSensor'

const decodeValue = (value) => new TextDecoder().decode(value)

export function useSensors() {
  const [simulating, setSimulating] = useState(false)
  const [connected,  setConnected]  = useState(false)
  const [bleError,   setBleError]   = useState(null)

  const bleDeviceRef = useRef(null)

  // ── Per-sensor hooks ──────────────────────

  const imuSensor = useImuSensor()
  const tofSensor = useTofSensor()
  const ppgSensor = usePpgSensor()

  // ── Simulation ────────────────────────────

  const startSimulation = useCallback(() => {
    imuSensor.startSim()
    tofSensor.startSim()
    ppgSensor.startSim()
    setSimulating(true)
  }, [imuSensor, tofSensor, ppgSensor])

  const stopSimulation = useCallback(() => {
    imuSensor.stopSim()
    tofSensor.stopSim()
    ppgSensor.stopSim()
    setSimulating(false)
  }, [imuSensor, tofSensor, ppgSensor])

  const toggleSimulation = useCallback(() => {
    if (connected) return
    simulating ? stopSimulation() : startSimulation()
  }, [connected, simulating, startSimulation, stopSimulation])

  // ── Web Bluetooth connection ──────────────

  const connectBLE = useCallback(async () => {
    if (!navigator.bluetooth) {
      setBleError(
        'Web Bluetooth API not supported. Use Chrome or Edge (desktop) on https or localhost.'
      )
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
        imuSensor.setPitchOverride(null)
        resetPpgBuffer()
      })

      const server  = await device.gatt.connect()
      const service = await server.getPrimaryService(BLE_SERVICE_UUID)

      stopSimulation()
      setConnected(true)
      imuSensor.setPitchOverride(null)
      imuSensor.yawRef.current = 0

      // ── IMU notifications ──────────────────
      const imuChar = await service.getCharacteristic(BLE_CHAR_IMU_UUID)
      await imuChar.startNotifications()
      imuChar.addEventListener('characteristicvaluechanged', (e) => {
        imuSensor.handleBleValue(decodeValue(e.target.value))
      })

      // ── ToF notifications ──────────────────
      const tofChar = await service.getCharacteristic(BLE_CHAR_TOF_UUID)
      await tofChar.startNotifications()
      tofChar.addEventListener('characteristicvaluechanged', (e) => {
        tofSensor.handleBleValue(decodeValue(e.target.value))
      })

      // ── PPG notifications ──────────────────
      const ppgChar = await service.getCharacteristic(BLE_CHAR_PPG_UUID)
      await ppgChar.startNotifications()
      ppgChar.addEventListener('characteristicvaluechanged', (e) => {
        ppgSensor.handleBleValue(decodeValue(e.target.value))
      })

    } catch (err) {
      if (err.name !== 'NotFoundError') {
        setBleError(err.message)
      }
    }
  }, [imuSensor, tofSensor, ppgSensor, stopSimulation])

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
    imuSensor.setPitchOverride(null)
    resetPpgBuffer()
  }, [imuSensor])

  const toggleConnection = useCallback(() => {
    connected ? disconnectBLE() : connectBLE()
  }, [connected, connectBLE, disconnectBLE])

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
    // Sensor data
    imu: imuSensor.imu,
    tof: tofSensor.tof,
    ppg: ppgSensor.ppg,

    // Derived orientation
    roll:  imuSensor.roll,
    pitch: imuSensor.pitch,
    yaw:   imuSensor.yaw,

    // Connection state
    simulating,
    connected,
    bleError,

    // Actions
    toggleSimulation,
    toggleConnection,
    reset,

    // Escape hatch: allow components to push raw IMU frames (e.g. unit tests)
    setImu: imuSensor.setImu,
  }
}