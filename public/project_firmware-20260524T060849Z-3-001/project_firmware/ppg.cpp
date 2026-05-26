#include "ppg.h"
#include <Wire.h>

// ─────────────────────────────────────────
//  State internal
// ─────────────────────────────────────────
static bool _initialized = false;

// ─────────────────────────────────────────
//  Helper: tulis satu byte ke register MAX30102
// ─────────────────────────────────────────
static bool _writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MAX_ADDR);
  Wire.write(reg);
  Wire.write(value);
  return (Wire.endTransmission() == 0);
}

// ─────────────────────────────────────────
//  Helper: baca satu byte dari register MAX30102
// ─────────────────────────────────────────
static uint8_t _readRegister(uint8_t reg) {
  Wire.beginTransmission(MAX_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(MAX_ADDR, 1, true);
  return Wire.read();
}

// ─────────────────────────────────────────
//  Helper: reset FIFO pointer
// ─────────────────────────────────────────
static void _resetFifo() {
  _writeRegister(REG_FIFO_WR_PTR, 0x00);
  _writeRegister(REG_OVF_COUNTER, 0x00);
  _writeRegister(REG_FIFO_RD_PTR, 0x00);
}

// ─────────────────────────────────────────
//  Helper: baca satu sampel dari FIFO
//  MAX30102 kirim Red dulu, lalu IR — masing-masing 3 byte (18-bit)
// ─────────────────────────────────────────
static void _readFifoSample(uint32_t &red, uint32_t &ir) {
  Wire.beginTransmission(MAX_ADDR);
  Wire.write(REG_FIFO_DATA);
  Wire.endTransmission(false);
  Wire.requestFrom(MAX_ADDR, 6, true);

  red  = (uint32_t)(Wire.read() & 0x03) << 16;
  red |= (uint32_t)Wire.read() << 8;
  red |=  Wire.read();

  ir   = (uint32_t)(Wire.read() & 0x03) << 16;
  ir  |= (uint32_t)Wire.read() << 8;
  ir  |=  Wire.read();
}

// ─────────────────────────────────────────
//  ppgInit()
//  Inisialisasi MAX30102 via raw I2C.
//  Verifikasi Part ID, konfigurasi mode HR.
//  Kembalikan true jika berhasil.
// ─────────────────────────────────────────
bool ppgInit() {
  // Verifikasi Part ID — register 0xFF harus kembalikan 0x15
  uint8_t partId = _readRegister(REG_PART_ID);
  if (partId != 0x15) {
    Serial.print("[PPG] ERROR: Part ID tidak sesuai (0x");
    Serial.print(partId, HEX);
    Serial.println("). Periksa wiring/daya.");
    _initialized = false;
    return false;
  }

  // Reset FIFO
  _resetFifo();

  // Interrupt: aktifkan PPG_RDY
  _writeRegister(REG_INTR_ENABLE_1, 0xC0);
  _writeRegister(REG_INTR_ENABLE_2, 0x00);

  // FIFO config: 4 sampel rata-rata, FIFO rollover aktif
  _writeRegister(REG_FIFO_CONFIG, 0x4F);

  // Mode: Heart Rate (Red + IR)
  _writeRegister(REG_MODE_CONFIG, 0x03);

  // SpO2 config: ADC 4096nA, 400 sample/s, 18-bit resolusi
  _writeRegister(REG_SPO2_CONFIG, 0x27);

  // LED current: ~7mA untuk Red dan IR (0x24 = 7.2mA, step 0.2mA)
  _writeRegister(REG_LED1_PA, 0x24);
  _writeRegister(REG_LED2_PA, 0x24);
  _writeRegister(REG_PILOT_PA, 0x7F);

  _initialized = true;
  Serial.println("[PPG] Sensor siap.");
  return true;
}

// ─────────────────────────────────────────
//  ppgRead()
//  Baca satu sampel raw IR dan Red dari FIFO.
//  Non-blocking — langsung kembalikan nilai terbaru.
//  Deteksi kontak kulit dari nilai IR.
// ─────────────────────────────────────────
PpgReading ppgRead() {
  PpgReading result = { 0, 0, PpgContactStatus::SENSOR_ERROR };

  if (!_initialized) {
    Serial.println("[PPG] ERROR: Sensor belum diinisialisasi.");
    return result;
  }

  // Reset FIFO sebelum baca agar dapat sampel terbaru
  _resetFifo();

  // Tunggu satu sampel tersedia (maksimal 100ms)
  unsigned long timeout = millis() + 100;
  while (millis() < timeout) {
    if (_readRegister(REG_FIFO_WR_PTR) != _readRegister(REG_FIFO_RD_PTR)) break;
    delay(1);
  }

  _readFifoSample(result.redValue, result.irValue);

  // Evaluasi kontak kulit dari nilai IR
  result.contactStatus = (result.irValue >= PPG_IR_CONTACT_THRESHOLD)
                         ? PpgContactStatus::CONTACT
                         : PpgContactStatus::NO_CONTACT;

  return result;
}

// ─────────────────────────────────────────
//  contactStatusToString()
//  Konversi enum status ke string (untuk debug / BLE)
// ─────────────────────────────────────────
const char* contactStatusToString(PpgContactStatus status) {
  switch (status) {
    case PpgContactStatus::CONTACT:      return "CONTACT";
    case PpgContactStatus::NO_CONTACT:   return "NO_CONTACT";
    case PpgContactStatus::SENSOR_ERROR: return "SENSOR_ERROR";
    default:                             return "UNKNOWN";
  }
}
