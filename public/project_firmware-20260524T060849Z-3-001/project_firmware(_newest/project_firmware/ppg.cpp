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
//  Helper: baca satu sampel dari FIFO (API lama)
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
//  Mode SpO2 (Red + IR), 100 sampel/detik, TANPA averaging.
// ─────────────────────────────────────────
bool ppgInit() {
  uint8_t partId = _readRegister(REG_PART_ID);
  if (partId != 0x15) {
    Serial.print("[PPG] ERROR: Part ID tidak sesuai (0x");
    Serial.print(partId, HEX);
    Serial.println("). Periksa wiring/daya.");
    _initialized = false;
    return false;
  }

  _resetFifo();

  _writeRegister(REG_INTR_ENABLE_1, 0xC0);
  _writeRegister(REG_INTR_ENABLE_2, 0x00);

  // FIFO config 0x1F: SMP_AVE = 000 (tanpa averaging → output 100 Hz penuh),
  //                   rollover aktif, almost-full = 15.
  // (nilai lama 0x4F = rata-rata 4 sampel → hanya 25 Hz)
  _writeRegister(REG_FIFO_CONFIG, 0x1F);

  // Mode 0x03: SpO2 (Red + IR), 6 byte per sampel
  _writeRegister(REG_MODE_CONFIG, 0x03);

  // SpO2 config 0x27: ADC range 4096 nA, 100 sampel/detik, pulse width 411 us (18-bit)
  _writeRegister(REG_SPO2_CONFIG, 0x27);

  // LED current ~7 mA (0x24)
  _writeRegister(REG_LED1_PA, 0x24);
  _writeRegister(REG_LED2_PA, 0x24);
  _writeRegister(REG_PILOT_PA, 0x7F);

  _initialized = true;
  Serial.println("[PPG] Sensor siap (100 Hz, tanpa averaging).");
  return true;
}

// ─────────────────────────────────────────
//  ppgFlush()
//  Buang semua sampel lama. Panggil saat sensor baru dinyalakan / masuk state yang memakai PPG.
// ─────────────────────────────────────────
void ppgFlush() {
  if (_initialized) _resetFifo();
}

// ─────────────────────────────────────────
//  ppgReadBatch()
//  Kuras semua sampel yang tersedia di FIFO (maks PPG_BATCH_MAX) tanpa membuang apa pun.
//  Panggil tiap ~100 ms → sekitar 10 sampel per panggilan.
//  Red tidak dibaca untuk HRV (hanya dibuang) agar paket kecil.
// ─────────────────────────────────────────
int ppgReadBatch(PpgBatch &b) {
  b.n = 0;
  b.overflow = false;
  b.contactStatus = PpgContactStatus::SENSOR_ERROR;
  if (!_initialized) return 0;

  int avail = 0;
  
  // If the overflow counter is > 0, the FIFO is completely full (32 samples)
  if (_readRegister(REG_OVF_COUNTER) & 0x1F) {
    b.overflow = true;
    avail = 32; // Force available count to max capacity
    
    // Clear the overflow counter so it doesn't get stuck
    _writeRegister(REG_OVF_COUNTER, 0x00);
  } else {
    // Normal calculation if not overflowed
    avail = ((int)_readRegister(REG_FIFO_WR_PTR) - (int)_readRegister(REG_FIFO_RD_PTR)) & 0x1F;
  }

  Serial.print("[PPG-DEBUG] FIFO Available: "); 
  Serial.print(avail);

  if (avail > PPG_BATCH_MAX) avail = PPG_BATCH_MAX; // Cap at 24 to fit BLE limit

  while (avail > 0) {
    int chunk = avail < 4 ? avail : 4;
    Wire.beginTransmission(MAX_ADDR);
    Wire.write(REG_FIFO_DATA);
    Wire.endTransmission(false);
    Wire.requestFrom(MAX_ADDR, chunk * 6, true);

    for (int i = 0; i < chunk && Wire.available() >= 6; i++) {
      Wire.read(); Wire.read(); Wire.read(); // Red (dibuang)
      uint32_t ir  = (uint32_t)(Wire.read() & 0x03) << 16;
      ir |= (uint32_t)Wire.read() << 8;
      ir |= Wire.read();
      if (b.n < PPG_BATCH_MAX) b.ir[b.n++] = ir;
    }
    avail -= chunk;
  }

  if (b.n > 0) {
    b.contactStatus = (b.ir[b.n - 1] >= PPG_IR_CONTACT_THRESHOLD)
                      ? PpgContactStatus::CONTACT
                      : PpgContactStatus::NO_CONTACT;
  }
  
  Serial.print(" | Extracted: ");
  Serial.print(b.n);
  Serial.print(" | Contact: ");
  Serial.println(contactStatusToString(b.contactStatus));
  
  return b.n;
}
// ─────────────────────────────────────────
//  ppgRead()  –  API LAMA (1 sampel)
//  Mereset FIFO setiap panggilan, jadi hanya ~1 sampel per panggilan. Tidak untuk HRV.
// ─────────────────────────────────────────
PpgReading ppgRead() {
  PpgReading result = { 0, 0, PpgContactStatus::SENSOR_ERROR };

  if (!_initialized) {
    Serial.println("[PPG] ERROR: Sensor belum diinisialisasi.");
    return result;
  }

  _resetFifo();

  unsigned long timeout = millis() + 100;
  while (millis() < timeout) {
    if (_readRegister(REG_FIFO_WR_PTR) != _readRegister(REG_FIFO_RD_PTR)) break;
    delay(1);
  }

  _readFifoSample(result.redValue, result.irValue);

  result.contactStatus = (result.irValue >= PPG_IR_CONTACT_THRESHOLD)
                         ? PpgContactStatus::CONTACT
                         : PpgContactStatus::NO_CONTACT;
  return result;
}

const char* contactStatusToString(PpgContactStatus status) {
  switch (status) {
    case PpgContactStatus::CONTACT:      return "CONTACT";
    case PpgContactStatus::NO_CONTACT:   return "NO_CONTACT";
    case PpgContactStatus::SENSOR_ERROR: return "SENSOR_ERROR";
    default:                             return "UNKNOWN";
  }
}

// ─────────────────────────────────────────
//  TIER 2: Hardware Sleep / Wake (MAX30102)
// ─────────────────────────────────────────
void ppgSleep() {
  if (!_initialized) return;
  // Set SHDN bit (bit 7) to 1, keep SpO2 mode (0x03) -> 0x83
  _writeRegister(REG_MODE_CONFIG, 0x83); 
  Serial.println("[PPG] Tier 2: Sleeping (Low Power)");
}

void ppgWake() {
  if (!_initialized) return;
  // Clear SHDN bit (bit 7) to 0, keep SpO2 mode (0x03)
  _writeRegister(REG_MODE_CONFIG, 0x03); 
  
  // Give the sensor a moment to stabilize and flush old garbage data
  delay(10); 
  ppgFlush(); 
  Serial.println("[PPG] Tier 2: Waking up");
}