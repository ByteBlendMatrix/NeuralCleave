"use client";

import { useEffect } from "react";
import { Keyboard, X } from "lucide-react";

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    title: "Global",
    rows: [
      { keys: ["Ctrl", "Shift", "Space"], label: "Summon window from anywhere" },
      { keys: ["Ctrl", "/"], label: "Open this shortcuts panel" },
    ],
  },
  {
    title: "Navigation",
    rows: [
      { keys: ["G", "then", "D"], label: "Go to Dashboard" },
      { keys: ["G", "then", "C"], label: "Go to Chat" },
      { keys: ["G", "then", "M"], label: "Go to Memory" },
      { keys: ["G", "then", "H"], label: "Go to Channels" },
      { keys: ["G", "then", "T"], label: "Go to Terminal" },
      { keys: ["G", "then", "O"], label: "Go to Observability" },
      { keys: ["G", "then", "S"], label: "Go to Settings" },
    ],
  },
  {
    title: "In-page",
    rows: [
      { keys: ["Esc"], label: "Close modal / dismiss overlay" },
      { keys: ["?"], label: "Open shortcuts panel" },
      { keys: ["Ctrl", "K"], label: "Focus search / command input" },
    ],
  },
];

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.6rem] items-center justify-center rounded border border-slate-600 bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">
      {children}
    </kbd>
  );
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2 text-white">
            <Keyboard className="h-4 w-4 text-indigo-400" />
            <span className="text-sm font-semibold">Keyboard Shortcuts</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-white"
            aria-label="Close shortcuts panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Shortcut rows */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {section.title}
              </p>
              <div className="space-y-2">
                {section.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-800/60"
                  >
                    <span className="text-sm text-slate-300">{row.label}</span>
                    <div className="flex items-center gap-1">
                      {row.keys.map((k, i) =>
                        k === "then" ? (
                          <span key={i} className="text-[10px] text-slate-600">
                            then
                          </span>
                        ) : (
                          <Key key={i}>{k}</Key>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-800 px-5 py-3">
          <p className="text-center text-xs text-slate-600">
            Press <Key>Esc</Key> or click outside to close
          </p>
        </div>
      </div>
    </div>
  );
}
