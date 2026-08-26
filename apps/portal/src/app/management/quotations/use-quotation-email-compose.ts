"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  customerRegisteredEmail,
  quotationComposeHref,
  type QuotationRow,
} from "./quotations-ui";
import { fetchQuotationPdf } from "./use-quotations-query";

export function useQuotationEmailCompose() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function compose(quotation: QuotationRow): Promise<string | null> {
    const email = customerRegisteredEmail(quotation.customer);
    if (!email) {
      return "Customer belum memiliki email terdaftar. Lengkapi email di data Customer sebelum mengirim quotation.";
    }

    setPending(true);
    try {
      await fetchQuotationPdf(quotation.id);
      router.push(quotationComposeHref(quotation, email));
      return null;
    } catch {
      return "Gagal membuat PDF quotation. Email compose tidak dibuka.";
    } finally {
      setPending(false);
    }
  }

  return { compose, pending };
}
