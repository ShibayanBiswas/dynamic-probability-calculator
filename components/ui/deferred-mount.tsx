"use client";

import { useEffect, useState, type ReactNode } from "react";

import { runWhenIdle } from "@/lib/client/idle-task";

/** Mount children after first paint so heavy analytics do not block interaction. */
export function DeferredMount({
  children,
  fallback = null,
  idleTimeoutMs = 120,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  idleTimeoutMs?: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    runWhenIdle(() => setReady(true), idleTimeoutMs);
  }, [idleTimeoutMs]);

  return ready ? children : fallback;
}
