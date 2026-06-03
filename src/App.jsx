// ─────────────────────────────────────────────
//  App.jsx  –  top-level orchestrator
//  Composes hook + components. Zero inline logic.
// ─────────────────────────────────────────────

import { useSensors }    from './hooks/useSensors'
import { Controls }      from './components/Controls'
import { ImuReadings }   from './components/ImuReadings'
import { ImuVisualizer } from './components/ImuVisualizer'
import { TofReadings }   from './components/TofReadings'
import { PpgReadings }   from './components/PpgReadings'

const bleSupported =
  typeof navigator !== 'undefined' && 'bluetooth' in navigator

function SectionLabel({ label }) {
  return (
    <p className="text-[10px] font-mono font-semibold uppercase tracking-widest opacity-40 mb-3">
      {label}
    </p>
  )
}

function App() {
  const {
    imu, tof, ppg,
    roll, pitch, yaw,
    simulating,
    connected,
    bleError,
    toggleSimulation,
    toggleConnection,
    reset,
  } = useSensors()

  const live = connected || simulating

  return (
    <main className="px-6 pt-8 pb-10 text-left">
      <h1>VisioGuard Monitor</h1>

      <Controls
        connected={connected}
        simulating={simulating}
        bleError={bleError}
        bleSupported={bleSupported}
        onToggleConnection={toggleConnection}
        onToggleSimulation={toggleSimulation}
        onReset={reset}
      />

      {/* ── Divider ── */}
      <div className="h-px bg-[var(--border)] my-6" />

      {/* ── Tiga kolom bersebelahan: IMU Readings | IMU Visualizer | ToF + PPG ── */}
      <div className="flex flex-row gap-6 items-start">

        {/* Kolom 1 — IMU Readings */}
        <div className="flex-1 min-w-0">
          <SectionLabel label="IMU · Inertial Measurement" />
          <ImuReadings imu={imu} roll={roll} pitch={pitch} yaw={yaw} live={live} />
        </div>

        {/* Kolom 2 — IMU Visualizer (3-D) */}
        <div className="flex-1 min-w-0">
          <SectionLabel label="IMU · 3D Visualizer" />
          <ImuVisualizer roll={roll} pitch={pitch} yaw={yaw} simulating={simulating} />
        </div>

        {/* Kolom 3 — ToF + PPG */}
        <div className="flex-1 min-w-0">
          <SectionLabel label="ToF · Distance  /  PPG · Biometrics" />
          <div className="flex flex-col gap-6">
            <TofReadings tof={tof} live={live} />
            <PpgReadings ppg={ppg} live={live} />
          </div>
        </div>

      </div>
    </main>
  )
}

export default App