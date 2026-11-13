// ─────────────────────────────────────────────
//  measureMessages.js  –  Indonesian texts for the measurement screens (handoff §6.4)
//  One place, no React. Texts are a UI draft that has NOT been tested with users.
// ─────────────────────────────────────────────

export const NOT_MEDICAL = 'Bukan alat medis. Hasil ini hanya saran ringan, bukan diagnosis.'

/** Main message per decision status (handoff §4.3). No "kelelahan" label, no single score. */
export const STATUS_TEXT = Object.freeze({
  DROP: {
    tone: 'warn',
    title: 'HRV turun dibanding baseline',
    text: 'Pertimbangkan istirahat sejenak.',
  },
  SOFT: {
    tone: 'soft',
    title: 'HRV sedikit turun',
    text: 'RMSSD turun dibanding baseline, tetapi SDNN belum. Jeda singkat mungkin membantu.',
  },
  STABLE: {
    tone: 'ok',
    title: 'HRV stabil',
    text: 'HRV Anda masih dekat dengan baseline hari ini.',
  },
  INVALID: {
    tone: 'invalid',
    title: 'Pengukuran tidak valid',
    text: 'Tempel ulang dan coba lagi.',
  },
})

/** Short label for tables / CSV. */
export const STATUS_LABEL = Object.freeze({
  DROP: 'Saran istirahat',
  SOFT: 'Turun ringan',
  STABLE: 'Stabil',
  INVALID: 'Tidak valid',
})

// window failure reason → message + advice  (table 6.4)
const CAUSES = {
  no_contact: { msg: 'Jari terlepas.', tip: 'Tempel lagi dan tahan.' },
  no_signal: { msg: 'Jari terlepas.', tip: 'Tempel lagi dan tahan.' },
  vibration: { msg: 'Terdeteksi getaran.', tip: 'Jaga kacamata dan meja tetap diam.' },
  too_noisy: { msg: 'Sinyal kurang stabil.', tip: 'Tempel dengan tekanan sedang dan diam.' },
  too_few_beats: { msg: 'Sinyal kurang stabil.', tip: 'Tempel dengan tekanan sedang dan diam.' },
  low_perfusion: { msg: 'Sinyal kurang stabil.', tip: 'Tempel dengan tekanan sedang dan diam.' },
  too_short: { msg: 'Sinyal kurang stabil.', tip: 'Tempel dengan tekanan sedang dan diam.' },
  data_loss: { msg: 'Data dari kacamata banyak yang hilang.', tip: 'Dekatkan kacamata ke komputer lalu coba lagi.' },
  link_lost: { msg: 'Koneksi ke kacamata terputus.', tip: 'Pengukuran diulang setelah tersambung kembali.' },
}
const FALLBACK = { msg: 'Sinyal kurang stabil.', tip: 'Tempel dengan tekanan sedang dan diam.' }

export const causeText = (reason) => CAUSES[reason] || FALLBACK

export const BASELINE_FAILED = { msg: 'Baseline belum valid.', tip: 'Ulangi pengukuran baseline.' }

export const FITNESS_LEVELS = [
  { v: 1, label: 'Sangat kurang bugar' },
  { v: 2, label: 'Kurang bugar' },
  { v: 3, label: 'Biasa saja' },
  { v: 4, label: 'Bugar' },
  { v: 5, label: 'Sangat bugar' },
]

/** "2 dari 3 valid" */
export const validText = (valid, total) => `${valid} dari ${total} valid`
