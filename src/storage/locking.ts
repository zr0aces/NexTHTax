// Single writer per workspace ID within one origin/profile. Not a file-system-wide lock (see README limitations).
export interface WriterLock {
  granted: boolean;
  release(): void;
}

export async function acquireWriterLock(workspaceId: string): Promise<WriterLock> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (!locks) return { granted: false, release: () => undefined };
  return new Promise<WriterLock>((resolve, reject) => {
    let release: () => void = () => undefined;
    locks
      .request(`nexthtax-workspace:${workspaceId}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve({ granted: false, release: () => undefined });
          return undefined;
        }
        return new Promise<void>((done) => {
          release = done;
          resolve({ granted: true, release: () => release() });
        });
      })
      .catch(reject);
  });
}
