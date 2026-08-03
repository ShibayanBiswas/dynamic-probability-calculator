"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { DeskDialog, type DeskDialogState } from "@/components/ui/desk-dialog";
import { deskAlert, registerDeskAlert, type DeskAlertOptions } from "@/lib/desk-alert";

type DeskDialogContextValue = {
  alert: (message: string, options?: DeskAlertOptions) => void;
};

const DeskDialogContext = createContext<DeskDialogContextValue | null>(null);

export function DeskDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DeskDialogState | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const alert = useCallback((message: string, options?: DeskAlertOptions) => {
    const variant = options?.variant ?? "info";
    const title =
      options?.title ?? (variant === "error" ? "Cannot Continue" : variant === "warning" ? "Data Notice" : "Primary SP Dashboard");
    setState((current) => {
      if (current?.message === message && current.title === title) return current;
      return { title, message, variant };
    });
    setOpen(true);
  }, []);

  useEffect(() => {
    registerDeskAlert(alert);
    return () => registerDeskAlert(null);
  }, [alert]);

  const value = useMemo(() => ({ alert }), [alert]);

  return (
    <DeskDialogContext.Provider value={value}>
      {children}
      <DeskDialog open={open} state={state} onClose={close} />
    </DeskDialogContext.Provider>
  );
}

export function useDeskDialog() {
  const context = useContext(DeskDialogContext);
  if (!context) {
    return { alert: deskAlert };
  }
  return context;
}
