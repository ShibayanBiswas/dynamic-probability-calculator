"use client";

import { useState } from "react";

/**
 * Keeps local state aligned when an external value changes (e.g. controlled draft fields)
 * without a sync effect.
 */
export function usePropsSync<T>(value: T, resetKey?: string | number | null) {
  const [state, setState] = useState(value);
  const [syncToken, setSyncToken] = useState(() => `${resetKey ?? ""}\0${value}`);

  const nextToken = `${resetKey ?? ""}\0${value}`;
  if (nextToken !== syncToken) {
    setSyncToken(nextToken);
    setState(value);
  }

  return [state, setState] as const;
}
