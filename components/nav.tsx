"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, GraduationCap, Home, LogOut, MessageCircle, Settings } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Ana sayfa", icon: Home },
  { href: "/courses", label: "Dersler", icon: BookOpen },
  { href: "/chat", label: "Sohbet", icon: MessageCircle },
  { href: "/settings", label: "Ayarlar", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
        <GraduationCap className="size-5" />
      </span>
      <span className="text-lg font-bold tracking-tight">Profesör</span>
    </div>
  );
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-sidebar p-4 md:flex print:hidden">
      <Link href="/" className="px-2 py-2">
        <Logo />
      </Link>
      <nav className="mt-6 flex flex-1 flex-col gap-1">
        {items.slice(0, 3).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              isActive(pathname, href) && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
            )}
          >
            <Icon className="size-[18px]" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="space-y-1 border-t pt-3">
        <Link
          href="/settings"
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            isActive(pathname, "/settings") && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
          )}
        >
          <Settings className="size-[18px]" />
          Ayarlar ve kullanım
        </Link>
        <div className="flex items-center justify-between">
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              className="flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-4" />
              Çıkış
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/85 px-4 py-2 backdrop-blur md:hidden print:hidden">
      <Link href="/">
        <Logo />
      </Link>
      <div className="flex items-center">
        <ThemeToggle />
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Çıkış"
            className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </header>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground",
            isActive(pathname, href) && "text-primary",
          )}
        >
          <span
            className={cn(
              "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
              isActive(pathname, href) && "bg-primary/10",
            )}
          >
            <Icon className="size-5" />
          </span>
          {label}
        </Link>
      ))}
    </nav>
  );
}
