"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Screen } from "../../../../components/layout/screen";
import { Button } from "../../../../components/ui/button";
import { LoadingState, ErrorState } from "../../../../components/ui/state-views";
import { formatApiError } from "../../../../lib/api-errors";
import { canSubmitIdentityCorrection } from "../../../../lib/calibration/identity-gate";
import type { TechCalibrationJob } from "../../../../lib/calibration/types";
import { useJobQuery } from "../use-job-query";
import { consumeWizardEntryIntent } from "./wizard-nav";
import { initialWizardState, type WizardState } from "./wizard-state";

/** Where the wizard exits to — Job Saya home. */
const EXIT_HOME = "/jobs";

interface WizardContextValue {
  job: TechCalibrationJob;
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  /** Open the "keluar dari koreksi identitas?" confirm (header Beranda button). */
  requestExit: () => void;
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
  const pathname = usePathname();
  const jobQuery = useJobQuery(id);
  const [state, setState] = useState<WizardState | undefined>(undefined);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  // Bounce any entry that isn't a deliberate "Ajukan Koreksi Identitas" tap:
  // a physical Back into a stale wizard URL after submitting, or a mid-wizard
  // refresh. Ref-guarded so React StrictMode's double-invoke can't double-
  // consume the one-shot intent.
  const intentCheckedRef = useRef(false);
  const [staleEntry, setStaleEntry] = useState(false);
  useEffect(() => {
    if (intentCheckedRef.current) return;
    intentCheckedRef.current = true;
    if (!consumeWizardEntryIntent(id)) {
      setStaleEntry(true);
      router.replace(EXIT_HOME);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (jobQuery.data && !state) {
      setState(initialWizardState(jobQuery.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobQuery.data]);

  // Physical / OS back button guard. Wizard steps navigate with router.replace
  // (no popstate), so a browser "back" is always the hardware button or the
  // edge-swipe gesture — which would otherwise drop the whole wizard (reason,
  // signatures, photo) in one accidental press. Trap it: re-pin the current
  // step's URL so the page does not move, then ask to confirm. The in-app
  // header back arrow / Beranda button never reach here (they call router
  // methods, not history.back).
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const guardArmed =
    !staleEntry &&
    Boolean(jobQuery.data && canSubmitIdentityCorrection(jobQuery.data)) &&
    Boolean(state);

  useEffect(() => {
    if (!guardArmed) return;
    window.history.pushState(null, "", window.location.href);
    const onPopState = () => {
      window.history.pushState(null, "", pathnameRef.current);
      setExitConfirmOpen(true);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [guardArmed, pathname]);

  const exitToHome = () => {
    setExitConfirmOpen(false);
    router.replace(EXIT_HOME);
  };

  if (jobQuery.isPending || (jobQuery.data && !state)) {
    return (
      <Screen title="Koreksi Identitas" showBack showHome={false}>
        <LoadingState />
      </Screen>
    );
  }

  if (jobQuery.isError || !jobQuery.data) {
    return (
      <Screen title="Koreksi Identitas" showBack showHome={false}>
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
      <Screen title="Koreksi Identitas" showBack showHome={false}>
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">Aksi tidak tersedia.</p>
          <Button variant="secondary" onClick={() => router.replace(EXIT_HOME)}>
            Kembali ke Job Saya
          </Button>
        </div>
      </Screen>
    );
  }

  if (!state) {
    return (
      <Screen title="Koreksi Identitas" showBack showHome={false}>
        <LoadingState />
      </Screen>
    );
  }

  const update = (patch: Partial<WizardState>) =>
    setState((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <WizardContext.Provider
      value={{ job, state, update, requestExit: () => setExitConfirmOpen(true) }}
    >
      {children}
      {exitConfirmOpen ? (
        <ExitConfirmDialog onCancel={() => setExitConfirmOpen(false)} onConfirm={exitToHome} />
      ) : null}
    </WizardContext.Provider>
  );
}

function ExitConfirmDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-wizard-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="exit-wizard-title" className="text-base font-semibold text-slate-900">
          Keluar dari koreksi identitas?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Data yang sudah diisi (tanda tangan, foto) akan hilang.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="secondary" fullWidth onClick={onCancel}>
            Batal
          </Button>
          <Button fullWidth onClick={onConfirm}>
            Ya, keluar ke Job Saya
          </Button>
        </div>
      </div>
    </div>
  );
}
