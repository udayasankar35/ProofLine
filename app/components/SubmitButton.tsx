"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  pending = "Working…",
  className = "",
  disabled = false,
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" disabled={busy || disabled} aria-busy={busy} className={className}>
      {busy ? pending : children}
    </button>
  );
}
