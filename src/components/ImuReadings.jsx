// ─────────────────────────────────────────────
//  ImuReadings.jsx  –  UI component
//  Pure display: sensor values + orientation + FHP status.
//  Receives all numbers as props, renders nothing else.
//
//  Props:
//    imu   – { accel, gyro, mag, fhpStatus }
//    roll  – degrees
//    pitch – degrees
//    yaw   – degrees
//    live  – boolean; true when receiving real/simulated data
// ─────────────────────────────────────────────

function SensorGroup({ label, unit, data, decimals = 3, live = false }) {
  return (
    <div className="mb-[18px]">
      <span className="text-xs font-mono font-semibold">
        {label}
        {unit && (
          <span className="font-normal opacity-60"> {unit}</span>
        )}
      </span>

      <div>
        {Object.entries(data).map(([axis, val]) => (
          <div key={axis} className="font-mono text-sm leading-[1.6]">
            <span className="text-[var(--text)] w-3">{axis}</span> &nbsp;
            <span
              className={`tabular-nums transition-colors duration-100 ${
                live
                  ? 'text-[var(--accent)]'
                  : 'text-[var(--text-h)]'
              }`}
            >
              {val.toFixed(decimals)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PostureBadge({ status, live }) {
  const isWarning = status === 'POOR_POSTURE'
  const isUnknown = !live || status === 'UNKNOWN'
  return (
    <div className="mb-[18px]">
      <span className="text-xs font-mono font-semibold">Posture (FHP)</span>
      <div className="mt-1">
        <span
          className={`inline-block text-xs font-mono px-2 py-0.5 rounded-full border transition-colors ${
            isUnknown
              ? 'border-gray-300 text-gray-400 bg-gray-100'
              : isWarning
              ? 'border-red-400 text-red-500 bg-red-50'
              : 'border-green-500 text-green-600 bg-green-50'
          }`}
        >
          {isUnknown ? '– –' : isWarning ? '⚠ POOR POSTURE' : '✓ NORMAL'}
        </span>
      </div>
    </div>
  )
}

export function ImuReadings({ imu, roll, pitch, yaw = 0, live = false }) {
  return (
    <div className="min-w-[200px]">
      <SensorGroup
        label="Orientation"
        unit="°"
        data={{ roll, pitch, yaw }}
        decimals={1}
        live={live}
      />
      <PostureBadge status={imu.fhpStatus} live={live} />
      <SensorGroup label="Accelerometer" unit="g"   data={imu.accel} decimals={3} live={live} />
      <SensorGroup label="Gyroscope"     unit="°/s" data={imu.gyro}  decimals={1} live={live} />
      <SensorGroup label="Magnetometer"  unit="µT"  data={imu.mag}   decimals={1} live={live} />
    </div>
  )
}