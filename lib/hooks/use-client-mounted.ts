"use client";

import { useSyncExternalStore } from "react";

/** True after the client has mounted — avoids SSR/client markup drift for portals. */
export function useClientMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
