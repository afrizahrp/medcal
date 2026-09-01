# DeviceCategory → DeviceType taxonomy

Internal domain grouping for the 35 confirmed Kemenkes DeviceTypes.
`DeviceType.name` is source-locked from Sertifikat Standar PT Presisi Kalibrasi Medika.

Pending-review items are **not** DeviceTypes in this phase.

```text
Patient Monitoring
├── Blood Pressure Monitor
├── Pulse Oximeters
├── Oxymeter monitor
├── Ambulatory ECG
├── Cardiac Output Units (heart rate)
├── Electrocardiographs
├── Sphygmomanometers
├── Bed Side Monitor
└── Patient Monitor

Respiratory & Oxygen
├── Humidifier
├── Ventilator
├── Oxygen-Air Proportioners
├── Regulators (Air, O2, Suction [except tracheal])
├── Oxygen Concentrators
├── Ultrasonic Nebulizers
├── Nebulizer Compressor
└── Flow meter

Neonatal & Infant Care
├── Baby Incubator
├── Infant Warmer
└── Radiant Warmer

Resuscitation
├── Resuscitators (Cardiac)
└── Resuscitators (Pulmonary)

Suction & Fluid Management
├── Aspirators (Surgical, Thoracic, and Uterine)/ Suction
├── Breast Pumps (suction)
└── Regulators (Low-Volume Suction)

Sterilization
├── Sterillizer (Sterillisator)
└── Oven

Temperature Therapy
├── Radiant Warmers (Adult)
└── Paraffin Baths

Cold Chain & Storage
├── Blood Bank Refrigerators
├── Kulkas Vaksin
├── Coald Chain
├── Medical Refrigerator
└── Medical Freezer

Patient Care
└── Electric Beds (kelistrikan)
```

## Ambiguous mappings

| DeviceType | Category | Reason |
|---|---|---|
| Oxymeter monitor | Patient Monitoring | Source spelling kept; same domain as Pulse Oximeters. |
| Cardiac Output Units (heart rate) | Patient Monitoring | Cardiac measurement/monitoring; too few items for a separate Cardiology category. |
| Electrocardiographs | Patient Monitoring | Same as above. |
| Ambulatory ECG | Patient Monitoring | Same as above. |
| Sphygmomanometers | Patient Monitoring | Blood-pressure measurement, alongside Blood Pressure Monitor. |
| Humidifier | Respiratory & Oxygen | Airway humidification, not neonatal warming. |
| Regulators (Air, O2, Suction [except tracheal]) | Respiratory & Oxygen | Primary listed functions are Air/O2; suction is secondary. |
| Radiant Warmer | Neonatal & Infant Care | Unmarked (non-Adult) warmer in the Kemenkes list. |
| Radiant Warmers (Adult) | Temperature Therapy | Explicitly adult, not neonatal. |
| Breast Pumps (suction) | Suction & Fluid Management | Source name tags suction/vacuum. |
| Oven | Sterilization | Medical oven in this capability list is sterilizer/drying, not cold chain. |
| Paraffin Baths | Temperature Therapy | Therapeutic heating, not storage. |
| Coald Chain | Cold Chain & Storage | Source spelling kept in `name`. |
| Electric Beds (kelistrikan) | Patient Care | Electrical safety of a care bed, not monitoring. |

## Not implemented (PENDING_REVIEW)

```text
Suction Pump
Autoclave
Vaccine Ref
USG
Centrifuge
HypoHypertermia
Infuse Pump
Mikroskop
Syringe Pump
Timbangan Bayi
Timbangan Dewasa
Whirlpool Baths (suhu)
```
