// In-process Web Locks stand-in: ifAvailable grants only when the name is free. Mirrors the browser contract used by the app.
const held = new Set<string>();

export function installFakeLocks(): void {
  const locks = {
    request(name: string, options: { ifAvailable?: boolean }, callback: (lock: { name: string } | null) => unknown) {
      if (held.has(name) && options.ifAvailable) return Promise.resolve(callback(null));
      held.add(name);
      return Promise.resolve(
        callback({ name }),
      ).finally(() => held.delete(name));
    },
  };
  Object.defineProperty(globalThis.navigator, "locks", { value: locks, configurable: true });
}

export function holdLock(name: string): void {
  held.add(name);
}

export function releaseAllLocks(): void {
  held.clear();
}
