import type { StaticImageData } from "next/image";
import patientMonitorMain from "../../public/images/patient-monitor/patient-monitor-kalibrasi-main.png";
import patientMonitorFull from "../../public/images/patient-monitor/patient-monitor-kalibrasi-full.png";
import coldChainMain from "../../public/images/cold-chain/cold-chain-kalibrasi-main.png";
import coldChainFull from "../../public/images/cold-chain/cold-chain-kalibrasi-full.png";

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
  "cold-chain": {
    main: coldChainMain,
    full: coldChainFull,
    alt: "Konteks layanan kalibrasi cold chain & penyimpanan suhu medis",
  },
};
