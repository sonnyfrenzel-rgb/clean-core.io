import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Re-exported, not defined here. The escaper lives with the rest of the export
 * safety rules in `lib/export-safety.ts`; this keeps the import path the mail
 * routes already use.
 */
export { escapeHtml } from './export-safety';

