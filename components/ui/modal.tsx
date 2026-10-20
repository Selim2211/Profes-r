"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

// A centered pop-up with a dimmed backdrop. Closes with Esc, a click outside or the X button.
export function Modal({ open, onOpenChange, title, description, children, className }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 z-40 bg-foreground/30 backdrop-blur-[2px]" />
        <Dialog.Popup
          className={cn(
            "dialog-popup fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-popover p-6 text-popover-foreground shadow-xl ring-1 ring-border outline-none",
            className,
          )}
        >
          <Dialog.Close
            aria-label="Kapat"
            className="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </Dialog.Close>
          <Dialog.Title className="pr-10 text-lg font-semibold">{title}</Dialog.Title>
          {description && (
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>
          )}
          <div className="mt-5">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
