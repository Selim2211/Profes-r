import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Profesör</h1>
          <p className="text-sm text-muted-foreground">Kişisel ders asistanın</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
