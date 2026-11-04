#pragma once

#include <Arduino.h>

// ─────────────────────────────────────────
//  Threshold (override dari config.h nanti)
// ─────────────────────────────────────────
#ifndef PPG_IR_CONTACT_THRESHOLD
  #define PPG_IR_CONTACT_THRESHOLD 50000L  // IR minimum untuk deteksi kontak kulit
#endif

// Maksimum sampel IR per paket BLE. 24 sampel ≈ 210 byte JSON (muat di characteristic 240 byte)
#ifndef PPG_BATCH_MAX
  #define PPG_BATCH_MAX 24
#endif

// ─────────────────────────────────────────
//  Register MAX30102
// ─────────────────────────────────────────
#define MAX_ADDR              0x57
#define REG_INTR_ENABLE_1     0x02
#define REG_INTR_ENABLE_2     0x03
#define REG_FIFO_WR_PTR       0x04
#define REG_OVF_COUNTER       0x05
#define REG_FIFO_RD_PTR       0x06
#define REG_FIFO_DATA         0x07
#define REG_FIFO_CONFIG       0x08
#define REG_MODE_CONFIG       0x09
#define REG_SPO2_CONFIG       0x0A
#define REG_LED1_PA           0x0C   // Red LED
#define REG_LED2_PA           0x0D   // IR LED
#define REG_PILOT_PA          0x10
#define REG_PART_ID           0xFF   // Harus kembalikan 0x15

// ─────────────────────────────────────────
//  Status kontak sensor
// ─────────────────────────────────────────
enum class PpgContactStatus {
  CONTACT,       // Sensor menempel pada kulit
  NO_CONTACT,    // Sensor tidak menempel
  SENSOR_ERROR
};

// ─────────────────────────────────────────
//  Satu sampel (API lama, tetap ada agar kode lama tidak rusak)
// ─────────────────────────────────────────
struct PpgReading {
  uint32_t        irValue;
  uint32_t        redValue;
  PpgContactStatus contactStatus;
};

// ─────────────────────────────────────────
//  Kumpulan sampel IR berurutan (100 Hz) dari FIFO sensor
// ─────────────────────────────────────────
struct PpgBatch {
  uint8_t          n;                    // jumlah sampel valid di ir[]
  uint32_t         ir[PPG_BATCH_MAX];    // urut dari yang terlama
  PpgContactStatus contactStatus;        // dari sampel terakhir
  bool             overflow;             // true = FIFO penuh/hilang sampel, FIFO sudah di-reset
};

// ─────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────
bool        ppgInit();
PpgReading  ppgRead();                    // LAMA: 1 sampel, mereset FIFO. Jangan dicampur dengan ppgReadBatch()
int         ppgReadBatch(PpgBatch &b);    // BARU: kuras FIFO, kembalikan jumlah sampel
void        ppgFlush();                   // BARU: kosongkan FIFO (panggil saat masuk BASELINE_CREATION / CHECK_MODE)
const char* contactStatusToString(PpgContactStatus status);

// ─────────────────────────────────────────
//  TIER 2: Hardware Sleep / Wake (MAX30102)
// ─────────────────────────────────────────
void        ppgSleep();
void        ppgWake();