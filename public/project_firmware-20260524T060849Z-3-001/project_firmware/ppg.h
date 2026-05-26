#pragma once

#include <Arduino.h>

// ─────────────────────────────────────────
//  Threshold (override dari config.h nanti)
// ─────────────────────────────────────────
#ifndef PPG_IR_CONTACT_THRESHOLD
  #define PPG_IR_CONTACT_THRESHOLD 50000L  // IR minimum untuk deteksi kontak kulit
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
//  Struct hasil pembacaan PPG
//  Fokus raw data: IR dan Red
// ─────────────────────────────────────────
struct PpgReading {
  uint32_t        irValue;       // Raw IR — sinyal utama PPG
  uint32_t        redValue;      // Raw Red — pelengkap, bisa untuk SpO2 nanti
  PpgContactStatus contactStatus; // Status kontak kulit
};

// ─────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────
bool        ppgInit();
PpgReading  ppgRead();
const char* contactStatusToString(PpgContactStatus status);
