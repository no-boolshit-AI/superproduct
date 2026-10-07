"use client";

import { useId, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "../icon";

/**
 * Email form that really sends somewhere:
 * - action "mailto:…" opens the visitor's mail app with their address in the body;
 * - action "https://…" posts the form (field name "email") to that endpoint.
 */
export function EmailCapture({
  action,
  buttonLabel,
  placeholder = "you@company.com",
  subject = "Hello",
  note,
  className,
}: {
  action: string;
  buttonLabel: string;
  placeholder?: string;
  subject?: string;
  note?: string;
  className?: string;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "invalid" | "sent">("idle");
  const isMailto = action.startsWith("mailto:");

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) {
      e.preventDefault();
      setState("invalid");
      return;
    }
    if (isMailto) {
      e.preventDefault();
      window.location.href = `${action}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`Email: ${email}`)}`;
      setState("sent");
    }
  };

  return (
    <form action={isMailto ? undefined : action} method="post" onSubmit={onSubmit} noValidate className={cn("flex w-full flex-col gap-2", className)}>
      <label htmlFor={id} className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setState("idle");
          }}
          placeholder={placeholder}
          aria-invalid={state === "invalid"}
          aria-describedby={`${id}-status`}
          className="h-12 min-w-0 flex-1 rounded-button border border-border-strong bg-card px-4 text-body text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
        />
        <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-button bg-accent px-5 text-label text-on-accent transition-colors hover:bg-accent-hover">
          {buttonLabel}
          <Icon name="arrow-right" className="size-4" />
        </button>
      </div>
      <p id={`${id}-status`} aria-live="polite" className={cn("text-small", state === "invalid" ? "text-danger" : "text-fg-muted")}>
        {state === "invalid" ? "Please enter a valid email address." : state === "sent" ? "Your email app should open with the message ready to send." : note}
      </p>
    </form>
  );
}
