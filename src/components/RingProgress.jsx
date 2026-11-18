// Small circular progress used by the baseline wizard and the check screen.
export function RingProgress({ value = 0, label, sub, color = '#2563eb', size = 132 }) {
  const R = 52
  const C = 2 * Math.PI * R
  const v = Math.min(1, Math.max(0, value))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`${Math.round(v * 100)} percent`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="#ebeae6" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${v * C} ${C}`} transform="rotate(-90 60 60)"
          style={{ transition: 'stroke-dasharray 0.4s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-2xl font-medium text-ink-strong tabular-nums">{label}</span>
        {sub && <span className="text-caption text-ink-muted">{sub}</span>}
      </div>
    </div>
  )
}
