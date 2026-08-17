export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-canvas flex min-h-screen flex-col items-center justify-center px-4 py-8">
      {children}
    </div>
  );
}
