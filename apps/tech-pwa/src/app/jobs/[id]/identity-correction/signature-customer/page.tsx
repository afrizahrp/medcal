"use client";

import { useParams } from "next/navigation";
import { SignatureStepScreen } from "../signature-step";
import { useWizard } from "../layout";
import { step1Valid, signatureValid } from "../wizard-state";

export default function SignatureCustomerPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { state } = useWizard();

  return (
    <SignatureStepScreen
      role="CUSTOMER"
      roleLabel="Pelanggan"
      stepLabel="3/5"
      nextHref={`/jobs/${id}/identity-correction/photo`}
      guardValid={step1Valid(state) && signatureValid(state.signatures.TECHNICIAN)}
      guardRedirectHref={`/jobs/${id}/identity-correction/signature-technician`}
    />
  );
}
