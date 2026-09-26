import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-accent-strong text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.22)] hover:opacity-90 disabled:bg-surface-3 disabled:text-ink-4 disabled:opacity-100 disabled:shadow-none",
  secondary:
    "glass-pill text-ink hover:bg-surface-2 disabled:text-ink-4",
  ghost: "text-ink-2 hover:bg-surface-3 hover:text-ink disabled:text-ink-4 disabled:hover:bg-transparent",
  danger: "bg-danger text-white hover:opacity-90 disabled:bg-surface-3 disabled:text-ink-4 disabled:opacity-100",
  record: "bg-danger text-white hover:opacity-90 disabled:bg-surface-3 disabled:text-ink-4 disabled:opacity-100",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-8 w-8 p-0",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
}

export function Button({ className, variant = "primary", size = "md", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[opacity,background-color,border-color,transform] duration-200 select-none",
        "active:scale-[0.98] disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
