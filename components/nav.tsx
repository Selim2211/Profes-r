"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, MessageCircle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Ana sayfa", icon: Home },
  { href: "/courses", label: "Dersler", icon: BookOpen },
  { href: "/chat", label: "Sohbet", icon: MessageCircle },
  { href: "/review", label: "Tekrar", icon: RotateCcw },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r p-3 md:flex print:hidden">
      <div className="px-3 py-2 text-lg font-semibold">Profesör</div>
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-muted",
            isActive(pathname, href) && "bg-muted font-medium",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t bg-background md:hidden print:hidden">
      {items.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground",
            isActive(pathname, href) && "font-medium text-foreground",
          )}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
