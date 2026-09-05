"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Screen } from "../../../../components/layout/screen";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState } from "../../../../components/ui/state-views";
import { formatApiError } from "../../../../lib/api-errors";
import { canSubmitIdentityCorrection } from "../../../../lib/calibration/identity-gate";
import type { TechCalibrationJob } from "../../../../lib/calibration/types";
import { useJobQuery } from "../use-job-query";
import { initialWizardState, type WizardState } from "./wizard-state";

interface WizardContextValue {
  job: TechCalibrationJob;
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
}

const WizardContext = createContext<WizardContextValue | null>(null);

/** Screens under /jobs/[id]/identity-correction/* read and write wizard state through this. */
export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext);
  if (!ctx) throw new Error("useWizard must be used within the identity-correction wizard");
  return ctx;
}

export default function IdentityCorrectionLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const jobQuery = useJobQuery(id);
  const [state, setState] = useState<WizardState | undefined>(undefined);

  useEffect(() => {
    if (jobQuery.data && !state) {
      setState(initialWizardState(jobQuery.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobQuery.data]);

  if (jobQuery.isPending || (jobQuery.data && !state)) {
    return (
      <Screen title="Koreksi Identitas" showBack>
        <LoadingState />
      </Screen>
    );
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <Screen title="Koreksi Identitas" showBack>
        <ErrorState
          message={formatApiError(jobQuery.error, "Gagal memuat job.")}
          onRetry={() => void jobQuery.refetch()}
        />
      </Screen>
    );
  }

  const job = jobQuery.data;

  if (!canSubmitIdentityCorrection(job)) {
    return (
      <Screen title="Koreksi Identitas" showBack>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">Aksi tidak tersedia.</p>
          <Button variant="secondary" onClick={() => router.back()}>
            Kembali
          </Button>
        </div>
      </Screen>
    );
  }

  if (!state) {
    return (
      <Screen title="Koreksi Identitas" showBack>
        <LoadingState />
      </Screen>
    );
  }

  const update = (patch: Partial<WizardState>) =>
    setState((prev) => (prev ? { ...prev, ...patch } : prev));

  return <WizardContext.Provider value={{ job, state, update }}>{children}</WizardContext.Provider>;
}
