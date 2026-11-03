"use client";

import { useEffect, useRef, useState } from "react";

/** A password field with a button to show or hide what was typed. Hides again when the form is cleared. */
export default function PasswordInput({ id, name, className, autoComplete }: { id: string; name: string; className: string; autoComplete?: string }) {
  const [show, setShow] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const hide = () => setShow(false);
    form.addEventListener("reset", hide);
    return () => form.removeEventListener("reset", hide);
  }, []);

  return (
    <div className="relative mt-1">
      <input ref={input} id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} required className={`${className} pr-11`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-600 hover:text-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {show ? <path d="M4 4l16 16" /> : null}
        </svg>
      </button>
    </div>
  );
}
