import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-4 backdrop-blur-md transition-[border-color,box-shadow] " +
  "hover:border-ink-4 focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:bg-surface-2 disabled:text-ink-3";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "py-2", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "h-10 cursor-pointer", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-medium text-ink-2", className)} {...props} />;
}
