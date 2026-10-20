import { Logo } from "@/components/nav";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl bg-card p-8 shadow-sm ring-1 ring-border">
        <div className="space-y-3 text-center">
          <Logo className="justify-center" />
          <p className="text-sm text-muted-foreground">Kişisel ders asistanın</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
