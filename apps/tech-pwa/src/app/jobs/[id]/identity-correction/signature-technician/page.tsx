"use client";

import { useParams } from "next/navigation";
import { SignatureStepScreen } from "../signature-step";
import { useWizard } from "../layout";
import { step1Valid } from "../wizard-state";

export default function SignatureTechnicianPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { state } = useWizard();

  return (
    <SignatureStepScreen
      role="TECHNICIAN"
      roleLabel="Teknisi"
      stepLabel="2/5"
      nextHref={`/jobs/${id}/identity-correction/signature-customer`}
      backHref={`/jobs/${id}/identity-correction`}
      guardValid={step1Valid(state)}
      guardRedirectHref={`/jobs/${id}/identity-correction`}
    />
  );
}
