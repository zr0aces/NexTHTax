import { registerSW } from "virtual:pwa-register";

export interface OfflineHandlers {
  onOfflineReady: () => void;
  onNeedRefresh: (apply: () => void) => void;
}

/**
 * Registers the service worker with prompt-style updates. The new worker is never activated by force;
 * the app asks the user via onNeedRefresh and applies only when no data is unsaved.
 */
export function registerOfflineSupport(handlers: OfflineHandlers): void {
  if (!("serviceWorker" in navigator)) return;
  const updateSW = registerSW({
    immediate: true,
    onOfflineReady: handlers.onOfflineReady,
    onNeedRefresh: () => handlers.onNeedRefresh(() => void updateSW(true)),
  });
}
