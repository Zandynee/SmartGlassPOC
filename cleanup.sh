#!/usr/bin/env bash
# Moves the pre-HSM files that nothing imports any more into src/_obsolete/.
# Nothing is deleted. Run from the project root AFTER the app works in simulation.
# To undo: move the files back.
set -euo pipefail

SRC="${1:-src}"
DEST="$SRC/_obsolete"

FILES=(
  hooks/useSensors.js
  hooks/useImuSensor.js
  hooks/useTofSensor.js
  hooks/usePpgSensor.js
  hooks/useCalibration.js
  services/imuService.js
  services/ppgService.js
  services/tofService.js
  components/Controls.jsx
  components/CalibrationCard.jsx
  components/ImuReadings.jsx
  components/PpgReadings.jsx
  components/BpmOscilloscope.jsx
  components/TabBar.jsx
)

for f in "${FILES[@]}"; do
  if [ -f "$SRC/$f" ]; then
    mkdir -p "$DEST/$(dirname "$f")"
    mv "$SRC/$f" "$DEST/$f"
    echo "moved  $f"
  else
    echo "absent $f"
  fi
done

echo
echo "Check for leftover imports:"
grep -rnE "useSensors|useImuSensor|useTofSensor|usePpgSensor|useCalibration|imuService|ppgService|tofService|components/Controls|CalibrationCard|ImuReadings|PpgReadings|BpmOscilloscope|TabBar" "$SRC" \
  --include=*.js --include=*.jsx --exclude-dir=_obsolete || echo "none - safe to run the app"
