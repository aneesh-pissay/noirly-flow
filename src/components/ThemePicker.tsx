"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn, type ThemeDefinition } from "@noirly-dev/ui";
import { DURATION, EASE_OUT, SPRING } from "@noirly-dev/ui/motion";
import { useTheme } from "@/src/components/ThemeProvider";

function ThemeSwatch({ theme }: { theme: ThemeDefinition }) {
  return (
    <span className="flex shrink-0 gap-0.5" aria-hidden>
      <span
        className="size-2.5 rounded-full border border-black/10"
        style={{ background: theme.light.accent }}
      />
      <span
        className="size-2.5 rounded-full border border-white/10"
        style={{ background: theme.dark.accent }}
      />
    </span>
  );
}

type Props = {
  className?: string;
  size?: "sm" | "md";
};

export function ThemePicker({ className, size = "md" }: Props) {
  const { paletteId, setPalette, themes } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const activeTheme = themes.find((t) => t.id === paletteId);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function selectTheme(id: string) {
    setPalette(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <motion.button
        type="button"
        onClick={() => setOpen((value) => !value)}
        whileTap={{ scale: 0.9 }}
        transition={SPRING}
        aria-label="Choose color palette"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="true"
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-full border border-[var(--hairline)] text-[var(--text-secondary)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--text)]",
          size === "sm" ? "h-9 w-9" : "h-11 w-11",
        )}
      >
        <Palette size={size === "sm" ? 15 : 16} aria-hidden />
        <span
          className="absolute bottom-1.5 right-1.5 size-2 rounded-full ring-2 ring-[var(--bg)]"
          style={{ background: "var(--accent)" }}
          aria-hidden
        />
      </motion.button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={listId}
            role="dialog"
            aria-label="Color palettes"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="fixed inset-x-4 top-16 z-50 w-auto overflow-hidden rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-2 shadow-[var(--elev-2)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-[min(18rem,calc(100vw-2rem))]"
          >
            <p className="mono-label px-2 py-1.5" id={`${listId}-label`}>
              {activeTheme ? activeTheme.name : "Palette"}
            </p>
            <ul
              role="radiogroup"
              aria-labelledby={`${listId}-label`}
              data-lenis-prevent
              className="max-h-[min(24rem,60vh)] overflow-y-auto"
            >
              {themes.map((theme) => {
                const selected = theme.id === paletteId;
                return (
                  <li key={theme.id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => selectTheme(theme.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[var(--r-md)] px-2.5 py-2 text-left text-sm transition-colors",
                        selected
                          ? "bg-[var(--accent-soft)] text-[var(--text)]"
                          : "text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text)_4%,transparent)] hover:text-[var(--text)]",
                      )}
                    >
                      <ThemeSwatch theme={theme} />
                      <span className="min-w-0 flex-1 font-medium">{theme.name}</span>
                      {selected ? (
                        <Check size={14} className="shrink-0 text-[var(--accent)]" />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
