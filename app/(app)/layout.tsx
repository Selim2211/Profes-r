import { Suspense } from "react";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { BottomNav, SideNav } from "@/components/nav";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "../(auth)/login/actions";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<div className="hidden w-56 shrink-0 border-r md:block" />}>
        <SideNav />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-4 py-2 md:justify-end print:hidden">
          <span className="font-semibold md:hidden">Profesör</span>
          <div className="flex items-center gap-1">
            <Link
              href="/settings"
              aria-label="Ayarlar ve kullanım"
              title="Ayarlar ve kullanım"
              className="flex size-11 items-center justify-center rounded-lg hover:bg-muted"
            >
              <Settings className="size-4" />
            </Link>
            <ThemeToggle />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" className="min-h-11">
                <LogOut className="mr-2 size-4" />
                Çıkış
              </Button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 p-4 pb-24 md:pb-6 print:max-w-none print:p-0">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Yükleniyor...</p>}>
            {children}
          </Suspense>
        </main>
      </div>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
