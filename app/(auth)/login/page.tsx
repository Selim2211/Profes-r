import { Logo } from "@/components/nav";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-indigo-50 via-background to-violet-100 p-4 dark:from-indigo-950/40 dark:via-background dark:to-violet-950/40">
      <div className="w-full max-w-sm space-y-6 rounded-3xl bg-card p-8 shadow-xl ring-1 ring-border">
        <div className="space-y-3 text-center">
          <Logo className="justify-center" />
          <p className="text-sm text-muted-foreground">Kişisel ders asistanın</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
