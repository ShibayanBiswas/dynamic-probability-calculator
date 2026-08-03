export type DeskAlertVariant = "info" | "warning" | "error";

export type DeskAlertOptions = {
  title?: string;
  variant?: DeskAlertVariant;
};

type DeskAlertHandler = (message: string, options?: DeskAlertOptions) => void;

let handler: DeskAlertHandler | null = null;

/** Register the UI handler (called once by DeskDialogProvider). */
export function registerDeskAlert(next: DeskAlertHandler | null) {
  handler = next;
}

/** Show a styled desk dialog — falls back to `window.alert` before hydration. */
export function deskAlert(message: string, options?: DeskAlertOptions) {
  if (handler) {
    handler(message, options);
    return;
  }
  window.alert(options?.title ? `${options.title}\n\n${message}` : message);
}
