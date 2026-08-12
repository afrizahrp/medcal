import type { StaticImageData } from "next/image";
import patientMonitorMain from "../../public/images/patient-monitor/patient-monitor-kalibrasi-main.png";
import patientMonitorFull from "../../public/images/patient-monitor/patient-monitor-kalibrasi-full.png";
import bloodBankMain from "../../public/images/blood-bank/blood-bank-kalibrasi-main.png";
import bloodBankFull from "../../public/images/blood-bank/blood-bank-kalibrasi-full.png";

type CategoryImage = {
  main: StaticImageData;
  full: StaticImageData;
  alt: string;
};

// Prepared assets only exist for the two KAN-featured categories.
// The image represents the calibration service context, not a claim
// that the pictured unit is the exact equipment being calibrated.
export const categoryImages: Record<string, CategoryImage> = {
  "monitoring-pasien": {
    main: patientMonitorMain,
    full: patientMonitorFull,
    alt: "Konteks layanan kalibrasi alat monitoring pasien",
  },
  "blood-bank": {
    main: bloodBankMain,
    full: bloodBankFull,
    alt: "Konteks layanan kalibrasi blood bank & penyimpanan suhu medis",
  },
};
