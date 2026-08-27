import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@medcal/shared";
import { AuthProvider, useAuth, useAuthz, useRequireSession } from "./auth-provider";

const useSessionMock = vi.fn();

vi.mock("./auth-client", () => ({
  useSession: () => useSessionMock(),
}));

const apiFetchMock = vi.fn();

vi.mock("@medcal/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@medcal/shared")>();
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  };
});

const ME_A = {
  user: { id: "user-a", email: "a@test.com", name: "User A" },
  membership: { role: "ADMIN" as const, companyId: "co-1" },
  capabilities: {
    leadRead: true,
    chatRead: true,
    emailRead: true,
    emailSend: true,
    emailDelete: true,
    emailManage: true,
    customerRead: true,
    customerCreate: true,
    customerUpdate: true,
    uomRead: true,
    uomCreate: true,
    uomUpdate: true,
    deviceCategoryRead: true,
    deviceCategoryCreate: true,
    deviceCategoryUpdate: true,
    deviceCategoryDelete: true,
    deviceTypeRead: true,
    deviceTypeCreate: true,
    deviceTypeUpdate: true,
    deviceTypeDelete: true,
    deviceModelRead: true,
    deviceModelCreate: true,
    deviceModelUpdate: true,
    deviceModelDelete: true,
    deviceCapabilityRead: true,
    deviceCapabilityCreate: true,
    deviceCapabilityUpdate: true,
    deviceCapabilityDelete: true,
    deviceCapabilityItemRead: true,
    deviceCapabilityItemCreate: true,
    deviceCapabilityItemUpdate: true,
    deviceCapabilityItemDelete: true,
    deviceCalibrationParameterRead: true,
    deviceCalibrationParameterCreate: true,
    deviceCalibrationParameterUpdate: true,
    deviceCalibrationParameterDelete: true,
    deviceRead: true,
    deviceCreate: true,
    deviceUpdate: true,
    deviceDelete: true,
    calibrationRequestRead: true,
    calibrationRequestCreate: true,
    calibrationRequestUpdate: true,
    calibrationRequestCancel: true,
    quotationRead: true,
    quotationCreate: true,
    quotationUpdate: true,
    quotationCancel: true,
    quotationApprove: true,
  },
};

const ME_B = {
  user: { id: "user-b", email: "b@test.com", name: "User B" },
  membership: { role: "TECHNICIAN" as const, companyId: "co-1" },
  capabilities: {
    leadRead: false,
    chatRead: false,
    emailRead: false,
    emailSend: false,
    emailDelete: false,
    emailManage: false,
    customerRead: false,
    customerCreate: false,
    customerUpdate: false,
    uomRead: false,
    uomCreate: false,
    uomUpdate: false,
    deviceCategoryRead: false,
    deviceCategoryCreate: false,
    deviceCategoryUpdate: false,
    deviceCategoryDelete: false,
    deviceTypeRead: false,
    deviceTypeCreate: false,
    deviceTypeUpdate: false,
    deviceTypeDelete: false,
    deviceModelRead: false,
    deviceModelCreate: false,
    deviceModelUpdate: false,
    deviceModelDelete: false,
    deviceCapabilityRead: false,
    deviceCapabilityCreate: false,
    deviceCapabilityUpdate: false,
    deviceCapabilityDelete: false,
    deviceCapabilityItemRead: false,
    deviceCapabilityItemCreate: false,
    deviceCapabilityItemUpdate: false,
    deviceCapabilityItemDelete: false,
    deviceCalibrationParameterRead: false,
    deviceCalibrationParameterCreate: false,
    deviceCalibrationParameterUpdate: false,
    deviceCalibrationParameterDelete: false,
    deviceRead: false,
    deviceCreate: false,
    deviceUpdate: false,
    deviceDelete: false,
    calibrationRequestRead: false,
    calibrationRequestCreate: false,
    calibrationRequestUpdate: false,
    calibrationRequestCancel: false,
    quotationRead: false,
    quotationCreate: false,
    quotationUpdate: false,
    quotationCancel: false,
    quotationApprove: false,
  },
};

function Probe() {
  const auth = useAuth();
  const authz = useAuthz();
  const session = useRequireSession();
  return (
    <div>
      <span data-testid="loading">{String(auth.isAuthLoading)}</span>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="status">{session.status}</span>
      <span data-testid="user-id">{auth.user?.id ?? "none"}</span>
      <span data-testid="role">{authz.membership?.role ?? "none"}</span>
    </div>
  );
}

function renderAuthTree(onNeedsSignIn: () => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider onNeedsSignIn={onNeedsSignIn}>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { ...view, queryClient, onNeedsSignIn };
}

function text(testId: string): string {
  const nodes = screen.getAllByTestId(testId);
  return nodes[nodes.length - 1]?.textContent ?? "";
}

describe("AuthProvider", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    apiFetchMock.mockReset();
  });

  it("shows auth loading while session is pending", () => {
    useSessionMock.mockReturnValue({ data: null, isPending: true });
    renderAuthTree();

    expect(text("loading")).toBe("true");
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("bootstraps /me once when session becomes available", async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false,
    });
    apiFetchMock.mockResolvedValue(ME_A);

    renderAuthTree();

    await waitFor(() => {
      expect(text("authenticated")).toBe("true");
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith("/me");
    expect(text("user-id")).toBe("user-a");
    expect(text("role")).toBe("ADMIN");
  });

  it("does not fetch /me when unauthenticated and calls onNeedsSignIn", async () => {
    const onNeedsSignIn = vi.fn();
    useSessionMock.mockReturnValue({ data: null, isPending: false });

    renderAuthTree(onNeedsSignIn);

    await waitFor(() => {
      expect(onNeedsSignIn).toHaveBeenCalled();
    });

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(text("user-id")).toBe("none");
  });

  it("calls onNeedsSignIn when /me returns 401", async () => {
    const onNeedsSignIn = vi.fn();
    useSessionMock.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false,
    });
    apiFetchMock.mockRejectedValue(new ApiError(401, "Unauthorized"));

    renderAuthTree(onNeedsSignIn);

    await waitFor(() => {
      expect(onNeedsSignIn).toHaveBeenCalled();
    });
  });

  it("sets forbidden status when /me returns 403", async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false,
    });
    apiFetchMock.mockRejectedValue(new ApiError(403, "Forbidden"));

    renderAuthTree();

    await waitFor(() => {
      expect(text("status")).toBe("forbidden");
    });
  });

  it("sets pending status for ACCOUNT_PENDING", async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false,
    });
    apiFetchMock.mockRejectedValue(new ApiError(403, "Pending", { code: "ACCOUNT_PENDING" }));

    renderAuthTree();

    await waitFor(() => {
      expect(text("status")).toBe("pending");
    });
  });

  it("does not refetch /me when onNeedsSignIn callback identity changes", async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false,
    });
    apiFetchMock.mockResolvedValue(ME_A);

    const onNeedsSignInA = vi.fn();
    const onNeedsSignInB = vi.fn();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider onNeedsSignIn={onNeedsSignInA}>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(text("authenticated")).toBe("true");
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider onNeedsSignIn={onNeedsSignInB}>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(text("user-id")).toBe("user-a");
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears auth state after logout", async () => {
    useSessionMock.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false,
    });
    apiFetchMock.mockResolvedValue(ME_A);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider onNeedsSignIn={vi.fn()}>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(text("user-id")).toBe("user-a");
    });

    useSessionMock.mockReturnValue({ data: null, isPending: false });
    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider onNeedsSignIn={vi.fn()}>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(text("user-id")).toBe("none");
    });
  });

  it("does not let a late /me response for user A overwrite user B", async () => {
    let resolveA: (value: typeof ME_A) => void;
    let resolveB: (value: typeof ME_B) => void;

    const promiseA = new Promise<typeof ME_A>((resolve) => {
      resolveA = resolve;
    });
    const promiseB = new Promise<typeof ME_B>((resolve) => {
      resolveB = resolve;
    });

    useSessionMock.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false,
    });

    apiFetchMock.mockImplementationOnce(() => promiseA);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider onNeedsSignIn={vi.fn()}>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    useSessionMock.mockReturnValue({
      data: { user: { id: "user-b" } },
      isPending: false,
    });
    apiFetchMock.mockImplementationOnce(() => promiseB);

    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider onNeedsSignIn={vi.fn()}>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );

    resolveB!(ME_B);
    await waitFor(() => {
      expect(text("user-id")).toBe("user-b");
    });

    resolveA!(ME_A);
    await waitFor(() => {
      expect(text("user-id")).toBe("user-b");
    });
  });
});
