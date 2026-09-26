"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { LiquidGlass } from "@/components/LiquidGlass";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, footer, className }: DialogProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Portal to <body> so no transformed/animated ancestor can trap the fixed overlay.
  return createPortal(
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-[3px]" onMouseDown={onClose}>
      <LiquidGlass
        role="dialog"
        aria-modal="true"
        aria-label={title}
        radius={24}
        blur={22}
        strength={30}
        className={cn("dialog-in w-full max-w-lg overflow-hidden rounded-3xl", className)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h2 className="font-display text-xl font-semibold leading-tight text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-surface-3 px-6 py-3.5">{footer}</div>}
      </LiquidGlass>
    </div>,
    document.body,
  );
}
