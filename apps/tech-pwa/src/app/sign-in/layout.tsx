export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-canvas flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8 pb-safe-b pt-safe-t">
      {children}
    </div>
  );
}
