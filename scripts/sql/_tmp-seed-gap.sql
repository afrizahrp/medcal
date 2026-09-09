-- Compare live CalibrationTestPoint counts to the current seed-calibration-test-points.ts plan.
-- expected_n is copied from that file (not inferred).

CREATE TEMP TABLE seed_plan (
  code text PRIMARY KEY,
  expected_n int NOT NULL,
  notes text
);

INSERT INTO seed_plan (code, expected_n, notes) VALUES
  ('AUD_PURE_TONE_LINEARITY_KANAN', 7, NULL),
  ('AUD_PURE_TONE_LINEARITY_KIRI', 7, NULL),
  ('AUD_FREQUENCY_RESPONSE_KANAN', 4, 'unverified vs filled Excel'),
  ('AUD_FREQUENCY_RESPONSE_KIRI', 4, 'unverified vs filled Excel'),
  ('BSM_HEART_RATE', 4, NULL),
  ('BSM_RESP_RATE', 4, NULL),
  ('BSM_SPO2', 8, '8th duplicate 90; labels titik N'),
  ('BSM_SYSTOLIC', 7, NULL),
  ('BSM_MAP', 7, NULL),
  ('BSM_DIASTOLIC', 7, NULL),
  ('BPM_SYSTOLIC', 6, NULL),
  ('BPM_MAP', 6, NULL),
  ('BPM_DIASTOLIC', 6, NULL),
  ('PULSEOX_HEART_RATE', 4, NULL),
  ('PULSEOX_SPO2', 8, 'duplicate 90; labels titik N'),
  ('FDOP_HR_ACCURACY', 7, NULL),
  ('FM_FLOW_RATE', 7, NULL),
  ('BLNW_TEMP_CALIBRATION', 3, NULL),
  ('HUM_TEMP_ACCURACY', 2, NULL),
  ('CPAP_CONCENTRATION', 2, NULL),
  ('CPAP_FLOW_RATE', 5, NULL),
  ('EST_FREQUENCY', 3, NULL),
  ('EST_INTENSITY', 4, NULL),
  ('EST_PULSE_DURATION', 3, NULL),
  ('ECG_AMPLITUDE', 3, NULL),
  ('ECG_REC_SPEED', 2, NULL),
  ('ECG_HR_CAL', 3, NULL),
  ('INFUS_FLOW_RATE', 5, NULL),
  ('SYR_FLOW_RATE', 5, NULL),
  ('O2CON_FLOW_RATE', 5, NULL),
  ('RESUS_P_PRESSURE_ACC', 5, NULL),
  ('SPIRO_FVC', 2, NULL),
  ('SPHYG_PRESSURE_ACC', 6, NULL),
  ('CENT_SPEED', 3, NULL),
  ('CRFR_SPEED', 3, NULL),
  ('ROT_SPEED', 3, NULL),
  ('DXRAY_EXPOSURE_TIME', 3, NULL),
  ('SUCT_VACUUM_GAUGE', 6, NULL),
  ('SUCT_MAX_VACUUM', 3, NULL),
  ('INCU_AIR_TEMP', 10, NULL),
  ('VENT_TIDAL_VOLUME', 3, NULL),
  ('VENT_MINUTE_VOLUME', 3, NULL),
  ('VENT_RESP_RATE', 3, NULL),
  ('VENT_INSP_TIME', 3, NULL),
  ('VENT_EXP_TIME', 3, NULL),
  ('VENT_PEEP', 1, NULL),
  ('VENT_PPEAK', 1, NULL),
  ('VENT_FIO2', 4, NULL);

\echo '=== Seed plan vs DB (mismatches only) ==='
SELECT
  s.code,
  s.expected_n,
  COALESCE(COUNT(tp.id), 0) AS db_n,
  s.expected_n - COALESCE(COUNT(tp.id), 0) AS missing,
  CASE WHEN p.id IS NULL THEN 'PARAM_MISSING' ELSE 'SHORT_OR_LABEL' END AS issue,
  s.notes
FROM seed_plan s
LEFT JOIN "DeviceCalibrationParameter" p ON p.code = s.code
LEFT JOIN "CalibrationTestPoint" tp ON tp."deviceCalibrationParameterId" = p.id
GROUP BY s.code, s.expected_n, s.notes, p.id
HAVING p.id IS NULL OR COUNT(tp.id) <> s.expected_n
ORDER BY s.code;

\echo '=== Label mismatch: SPO2 90-points (seed wants titik N) ==='
SELECT p.code, tp.sequence, tp."settingLabel", tp."settingValue"
FROM "CalibrationTestPoint" tp
JOIN "DeviceCalibrationParameter" p ON p.id = tp."deviceCalibrationParameterId"
WHERE p.code IN ('BSM_SPO2', 'PULSEOX_SPO2')
ORDER BY p.code, tp.sequence;

\echo '=== Totals ==='
SELECT
  (SELECT COUNT(*) FROM seed_plan) AS seed_params,
  (SELECT SUM(expected_n) FROM seed_plan) AS seed_points,
  (SELECT COUNT(*) FROM "CalibrationTestPoint") AS db_points,
  (SELECT COUNT(DISTINCT "deviceCalibrationParameterId") FROM "CalibrationTestPoint") AS db_params_with_points;
