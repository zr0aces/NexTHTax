// Test-only stand-in for vite-plugin-pwa's virtual module. Production builds use the real plugin.
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
