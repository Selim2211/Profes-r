import { Suspense } from "react";
import { BottomNav, SideNav, TopBar } from "@/components/nav";

// The navigation has no data of its own (it only reads the URL), so it appears with the first paint
// and pages stream in next to it. usePathname needs a Suspense boundary under cacheComponents.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<aside className="hidden w-64 shrink-0 border-r bg-sidebar md:block" />}>
        <SideNav />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
