"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "../icon";

/** Modal on native <dialog>: opens from its trigger, closes on Escape, backdrop click or the close button. */
export function Dialog({
  trigger,
  title,
  children,
  triggerClassName,
  size = "lg",
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  triggerClassName?: string;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" data-dialog-trigger aria-haspopup="dialog" onClick={() => ref.current?.showModal()} className={triggerClassName}>
        {trigger}
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        className={cn(
          "tone-light m-auto w-[calc(100%-2rem)] rounded-xl border border-line bg-canvas p-0 shadow-lg backdrop:bg-ink/60 backdrop:backdrop-blur-sm",
          size === "lg" ? "max-w-4xl" : "max-w-lg",
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
          <p className="text-subheading text-ink">{title}</p>
          <button type="button" aria-label="Close" onClick={() => ref.current?.close()} className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink">
            <Icon name="x" className="size-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </dialog>
    </>
  );
}
