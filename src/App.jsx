// ─────────────────────────────────────────────
//  App.jsx  –  top-level orchestrator
//  Composes hook + components. Zero inline logic.
// ─────────────────────────────────────────────

import { useImu }        from './hooks/useImu'
import { Controls }      from './components/Controls'
import { ImuReadings }   from './components/ImuReadings'
import { ImuVisualizer } from './components/ImuVisualizer'
import { TofReadings }   from './components/TofReadings'
import { PpgReadings }   from './components/PpgReadings'

const bleSupported =
  typeof navigator !== 'undefined' && 'bluetooth' in navigator

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <span className="text-[10px] font-mono font-semibold uppercase tracking-widest opacity-40">
        {label}
      </span>
      <div className="flex-1 h-px bg-[var(--border)]" />
    </div>
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
  } = useImu()

  const live = connected || simulating

  return (
    <main className="px-6 pt-8 pb-10 max-w-3xl text-left">
      <h1>Smart Glasses Monitor</h1>

      <Controls
        connected={connected}
        simulating={simulating}
        bleError={bleError}
        bleSupported={bleSupported}
        onToggleConnection={toggleConnection}
        onToggleSimulation={toggleSimulation}
        onReset={reset}
      />

      {/* ── IMU + 3-D visualizer ── */}
      <SectionDivider label="IMU · Inertial Measurement" />
      <div className="flex flex-row gap-6">
        <ImuReadings imu={imu} roll={roll} pitch={pitch} yaw={yaw} live={live} />
        <ImuVisualizer roll={roll} pitch={pitch} yaw={yaw} simulating={simulating} />
      </div>

      {/* ── ToF + PPG side by side ── */}
      <SectionDivider label="ToF · Distance  /  PPG · Biometrics" />
      <div className="flex flex-row gap-10">
        <TofReadings tof={tof} live={live} />
        <PpgReadings ppg={ppg} live={live} />
      </div>
    </main>
  )
}

export default App