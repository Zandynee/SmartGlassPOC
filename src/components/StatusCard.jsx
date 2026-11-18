// ─────────────────────────────────────────────
//  StatusCard.jsx  –  "Status Koneksi" card
//  Shows BLE / simulation state.
//
//  Props:
//    connected  – boolean; real BLE link is up
//    simulating – boolean; simulation mode is running
// ─────────────────────────────────────────────

import { Card } from './Card'

export function StatusCard({ connected, simulating }) {
  const label = connected ? 'Terhubung' : simulating ? 'Simulasi' : 'Tidak terhubung'
  const dot = connected ? '#2f9e6e' : simulating ? '#e0a030' : '#85857f'

  return (
    <Card title="Status koneksi" dot={dot}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p
            className={`m-0 text-3xl font-medium ${
              connected ? 'text-ok' : simulating ? 'text-warning' : 'text-ink-muted'
            }`}
          >
            {label}
          </p>
          <p className="mt-1 text-sm text-ink-muted">VisioGuard</p>
        </div>
      </div>
    </Card>
  )
}
