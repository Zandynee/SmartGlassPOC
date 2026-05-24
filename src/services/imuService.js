// ─────────────────────────────────────────────
//  imuService.js  –  pure / framework-agnostic
//  All maths, data-generation, and parsing lives here.
// ─────────────────────────────────────────────

// ── BLE configuration (must match firmware) ──

export const BLE_DEVICE_NAME   = 'SmartGlasses'
export const BLE_SERVICE_UUID  = '19b10000-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_TOF_UUID = '19b10001-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_IMU_UUID = '19b10002-e8f2-537e-4f6c-d104768a1214'
export const BLE_CHAR_PPG_UUID = '19b10003-e8f2-537e-4f6c-d104768a1214'
  
// ── Default sensor states ─────────────────────

/** Default IMU state (at rest, z-up) */
export const DEFAULT_IMU = {
  accel: { x: 0, y: 0, z: 1 },
  gyro:  { x: 0, y: 0, z: 0 },
  mag:   { x: 0, y: 0, z: 0 },
  fhpStatus: 'NORMAL',
}

/** Default ToF state */
export const DEFAULT_TOF = {
  distanceCm: 0,
  status: 'UNKNOWN',
}

/**
 * Default PPG state.
 * Format tetap sama (hrBpm, fatigueIndex, fatigueStatus) agar
 * PpgReadings.jsx tidak perlu diubah — kalkulasi selesai di sini
 * sebelum state disebarkan ke komponen.
 */
export const DEFAULT_PPG = {
  hrBpm:         0,
  fatigueIndex:  0,
  fatigueStatus: 'UNKNOWN',
}

// ── helpers ───────────────────────────────────

const toDeg = (rad) => (rad * 180) / Math.PI

/**
 * Compute roll & pitch (degrees) from accelerometer vector.
 * Uses the standard atan2 / atan tilt formulas.
 */
export function computeAngles(accel) {
  const { x, y, z } = accel
  const roll  = toDeg(Math.atan2(y, z))
  const pitch = toDeg(Math.atan(-x / Math.sqrt(y * y + z * z)))
  return { roll, pitch }
}

/**
 * Integrate yaw from gyro Z (°/s) over dt (seconds).
 * Wraps the result to [-180, 180].
 */
export function integrateYaw(prevYaw, gyroZ, dt = 0.1) {
  let yaw = prevYaw + gyroZ * dt
  if (yaw >  180) yaw -= 360
  if (yaw < -180) yaw += 360
  return yaw
}

// ── PPG: IR buffer & HR kalkulasi ────────────
//
//  Firmware kirim raw IR setiap 400ms.
//  Kita simpan ~5 detik history (= 12–13 sampel) lalu
//  deteksi peak untuk estimasi BPM.
//
//  Pendekatan: zero-crossing naik terhadap nilai rata-rata
//  (sama dengan logika di firmware sebelumnya, tapi di JS
//  kita punya buffer history lintas beberapa panggilan).

const PPG_IR_BUFFER_SIZE      = 13    // ~5 detik @ 400ms per sampel
const PPG_IR_CONTACT_MIN      = 50000 // IR minimum untuk deteksi kontak kulit
const PPG_FATIGUE_HR_THRESHOLD = 90   // BPM di atas ini = elevated

/** Ring buffer internal untuk sampel IR — tidak diekspos keluar. */
const _irBuffer  = new Array(PPG_IR_BUFFER_SIZE).fill(0)
let   _irHead    = 0       // indeks tulis berikutnya
let   _irCount   = 0       // berapa sampel sudah masuk (max = PPG_IR_BUFFER_SIZE)

/** Reset buffer saat disconnect / reset. */
export function resetPpgBuffer() {
  _irBuffer.fill(0)
  _irHead  = 0
  _irCount = 0
}

/**
 * Masukkan satu sampel IR baru ke ring buffer.
 * Dipanggil tiap kali BLE PPG notification datang.
 */
function _pushIr(irValue) {
  _irBuffer[_irHead % PPG_IR_BUFFER_SIZE] = irValue
  _irHead  = (_irHead + 1) % PPG_IR_BUFFER_SIZE
  if (_irCount < PPG_IR_BUFFER_SIZE) _irCount++
}

/**
 * Hitung estimasi HR dari ring buffer IR saat ini.
 *
 * Algoritma:
 *  1. Ambil snapshot buffer sesuai urutan kronologis
 *  2. Hitung rata-rata sebagai DC baseline
 *  3. Hitung zero-crossing naik (bawah→atas rata-rata) = satu beat
 *  4. Konversi jumlah beat ke BPM
 *     — durasi buffer = _irCount × 0.4 detik (INTERVAL_PPG_MS)
 *
 * Kembalikan null jika buffer belum penuh atau tidak ada kontak.
 */
function _calculateHrFromBuffer() {
  if (_irCount < PPG_IR_BUFFER_SIZE) return null   // tunggu buffer penuh dulu

  // Susun snapshot kronologis dari ring buffer
  const snapshot = []
  const start = _irHead  // _irHead sekarang menunjuk ke slot tertua
  for (let i = 0; i < PPG_IR_BUFFER_SIZE; i++) {
    snapshot.push(_irBuffer[(start + i) % PPG_IR_BUFFER_SIZE])
  }

  // DC baseline
  const mean = snapshot.reduce((s, v) => s + v, 0) / snapshot.length

  // Deteksi zero-crossing naik
  let beats    = 0
  let wasBelow = snapshot[0] < mean
  for (let i = 1; i < snapshot.length; i++) {
    const isBelow = snapshot[i] < mean
    if (wasBelow && !isBelow) beats++
    wasBelow = isBelow
  }

  // Durasi buffer dalam menit
  const durationMin = (PPG_IR_BUFFER_SIZE * 0.4) / 60
  const bpm = beats / durationMin

  // Validasi rentang fisiologis
  if (bpm < 40 || bpm > 200) return null
  return bpm
}

/**
 * Hitung fatigue index (0–100) dari BPM.
 * HR normal → indeks rendah; HR elevated → indeks naik.
 */
function _calculateFatigueIndex(bpm) {
  if (bpm <= PPG_FATIGUE_HR_THRESHOLD) {
    const ratio = Math.max(0, (bpm - 40) / (PPG_FATIGUE_HR_THRESHOLD - 40))
    return Math.round(ratio * 30)           // 0–30 di zona normal
  }
  const ratio = Math.min(1, (bpm - PPG_FATIGUE_HR_THRESHOLD) / (200 - PPG_FATIGUE_HR_THRESHOLD))
  return Math.round(30 + ratio * 70)        // 30–100 di zona elevated
}

// ── BLE characteristic parsers ────────────────

/**
 * Parse the IMU JSON characteristic from the firmware.
 * Format: {"pitch_deg":X,"ax":X,"ay":X,"az":X,"gx":X,"gy":X,"gz":X,"fhp_status":"NORMAL"}
 *
 * Returns { pitch, accel, gyro, fhpStatus } or null on parse failure.
 */
export function parseBleImu(raw) {
  try {
    const d = JSON.parse(raw)
    if (d.pitch_deg === undefined || d.ax === undefined) return null
    return {
      pitch:     d.pitch_deg,
      accel:     { x: d.ax,      y: d.ay,      z: d.az },
      gyro:      { x: d.gx ?? 0, y: d.gy ?? 0, z: d.gz ?? 0 },
      fhpStatus: d.fhp_status ?? 'NORMAL',
    }
  } catch {
    return null
  }
}

/**
 * Parse the ToF JSON characteristic from the firmware.
 * Format: {"distance_cm":X,"status":"OK"}
 *
 * Returns { distanceCm, status } or null on parse failure.
 */
export function parseBleTof(raw) {
  try {
    const d = JSON.parse(raw)
    if (d.distance_cm === undefined) return null
    return {
      distanceCm: d.distance_cm,
      status:     d.status ?? 'UNKNOWN',
    }
  } catch {
    return null
  }
}

/**
 * Parse the PPG JSON characteristic dari firmware (raw IR/Red).
 * Format firmware: {"ir":X,"red":X,"contact_status":"CONTACT"}
 *
 * Alur:
 *  1. Parse raw JSON dari firmware
 *  2. Cek kontak kulit dari contact_status dan nilai IR
 *  3. Push IR ke ring buffer
 *  4. Kalkulasi HR dari buffer (null jika belum cukup data)
 *  5. Kembalikan format yang sama dengan DEFAULT_PPG
 *     (hrBpm, fatigueIndex, fatigueStatus) agar PpgReadings.jsx
 *     tidak perlu diubah sama sekali.
 *
 * Returns { hrBpm, fatigueIndex, fatigueStatus } atau null pada parse failure.
 */
export function parseBlePpg(raw) {
  try {
    const d = JSON.parse(raw)
    if (d.ir === undefined) return null

    const irValue       = d.ir
    const contactStatus = d.contact_status ?? 'UNKNOWN'

    // Tidak ada kontak kulit → kosongkan buffer, kembalikan UNKNOWN
    if (contactStatus === 'NO_CONTACT' || irValue < PPG_IR_CONTACT_MIN) {
      resetPpgBuffer()
      return {
        hrBpm:         0,
        fatigueIndex:  0,
        fatigueStatus: 'NO_CONTACT',
      }
    }

    // Push ke buffer dan coba kalkulasi HR
    _pushIr(irValue)
    const bpm = _calculateHrFromBuffer()

    // Buffer belum penuh — kembalikan UNKNOWN sementara
    if (bpm === null) {
      return {
        hrBpm:         0,
        fatigueIndex:  0,
        fatigueStatus: 'UNKNOWN',
      }
    }

    const fatigueIndex  = _calculateFatigueIndex(bpm)
    const fatigueStatus = fatigueIndex > 75 ? 'FATIGUED' : 'FRESH'

    return {
      hrBpm:         bpm,
      fatigueIndex,
      fatigueStatus,
    }
  } catch {
    return null
  }
}

// ── Legacy Web Serial parser (kept for reference) ─

/**
 * Parse one line of MPU-6050 firmware output (Web Serial mode).
 *
 * Expected format (115200 baud, Arduino sketch):
 *   "Pitch: 15.3 Roll: -4.1 Yaw: 90.2 | ax: 0.123 ay: -0.456 az: 0.987 gx: 1.2 gy: -0.5 gz: 0.3"
 */
export function parseFirmwareLine(line) {
  const pitchM = line.match(/Pitch:\s*([-\d.]+)/)
  const rollM  = line.match(/Roll:\s*([-\d.]+)/)
  const yawM   = line.match(/Yaw:\s*([-\d.]+)/)
  const axM    = line.match(/ax:\s*([-\d.]+)/)
  const ayM    = line.match(/ay:\s*([-\d.]+)/)
  const azM    = line.match(/az:\s*([-\d.]+)/)
  const gxM    = line.match(/gx:\s*([-\d.]+)/)
  const gyM    = line.match(/gy:\s*([-\d.]+)/)
  const gzM    = line.match(/gz:\s*([-\d.]+)/)

  if (!pitchM || !rollM || !axM || !ayM || !azM) return null

  return {
    pitch: parseFloat(pitchM[1]),
    roll:  parseFloat(rollM[1]),
    yaw:   yawM ? parseFloat(yawM[1]) : null,
    accel: {
      x: parseFloat(axM[1]),
      y: parseFloat(ayM[1]),
      z: parseFloat(azM[1]),
    },
    gyro: {
      x: gxM ? parseFloat(gxM[1]) : 0,
      y: gyM ? parseFloat(gyM[1]) : 0,
      z: gzM ? parseFloat(gzM[1]) : 0,
    },
  }
}

// ── simulation ────────────────────────────────

/** Generate a single random IMU sample. */
export function randomImuSample() {
  return {
    accel: {
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: 0.5 + Math.random() * 1.5,
    },
    gyro: {
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
      z: (Math.random() - 0.5) * 200,
    },
    mag: {
      x: (Math.random() - 0.5) * 50,
      y: (Math.random() - 0.5) * 50,
      z: (Math.random() - 0.5) * 50,
    },
  }
}

/**
 * Blend previous state toward a new random sample.
 * α controls how "smooth" the walk is (lower = smoother).
 */
export function blendImu(prev, next, α = { accel: 0.2, gyro: 0.2, mag: 0.1 }) {
  const lerp = (a, b, t) => a * (1 - t) + b * t
  const blendAxis = (p, n, t) => ({
    x: lerp(p.x, n.x, t),
    y: lerp(p.y, n.y, t),
    z: lerp(p.z, n.z, t),
  })
  return {
    accel:     blendAxis(prev.accel, next.accel, α.accel),
    gyro:      blendAxis(prev.gyro,  next.gyro,  α.gyro),
    mag:       blendAxis(prev.mag,   next.mag,   α.mag),
    fhpStatus: prev.fhpStatus,
  }
}

/** Produce the next simulated IMU frame from the previous one. */
export function nextSimulatedFrame(prev) {
  return blendImu(prev, randomImuSample())
}

/** Produce a simulated ToF reading (10–50 cm random walk). */
export function nextSimulatedTof(prev) {
  const delta      = (Math.random() - 0.5) * 6
  const raw        = (prev?.distanceCm ?? 30) + delta
  const distanceCm = Math.min(50, Math.max(10, raw))
  return { distanceCm, status: 'OK' }
}

/**
 * Produce a simulated PPG reading (60–100 BPM random walk).
 * Mode simulasi tidak pakai buffer IR — langsung hasilkan BPM
 * agar UI tetap responsif saat tidak ada hardware.
 */
export function nextSimulatedPpg(prev) {
  const hrDelta      = (Math.random() - 0.5) * 4
  const fatigueDelta = (Math.random() - 0.5) * 6
  const hrBpm        = Math.min(100, Math.max(60, (prev?.hrBpm ?? 75) + hrDelta))
  const fatigueIndex = Math.min(100, Math.max(0,  (prev?.fatigueIndex ?? 30) + fatigueDelta))
  return {
    hrBpm,
    fatigueIndex,
    fatigueStatus: fatigueIndex > 75 ? 'FATIGUED' : 'FRESH',
  }
}
