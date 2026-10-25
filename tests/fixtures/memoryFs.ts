import type { DirHandleLike, FileHandleLike, WritableLike } from "../../src/storage/fs";

// Synthetic in-memory folder for integration tests. Writes are staged and committed on close, like createWritable.
// This proves app logic only. Real browser filesystem semantics still need the manual/browser evidence in the plan.

type Node = { kind: "file"; data: Uint8Array } | { kind: "dir"; children: Map<string, Node> };

export interface FaultHooks {
  /** Throw from close() for matching file paths. */
  failClose?: (path: string) => boolean;
  /** Flip a byte after a successful close so read-back verification fails. */
  corruptAfterClose?: (path: string) => boolean;
  /** Paths whose next read throws once (transient read-back failure after a successful close). */
  failNextRead?: Set<string>;
  /** Paths whose next successful close arms one read failure, simulating a failed read-back after the write. */
  failReadBackAfterWrite?: Set<string>;
}

function notFound(): DOMException {
  return new DOMException("not found", "NotFoundError");
}

class MemFile implements FileHandleLike {
  readonly kind = "file" as const;
  constructor(
    readonly name: string,
    private readonly path: string,
    private readonly node: { kind: "file"; data: Uint8Array },
    private readonly hooks: FaultHooks,
  ) {}
  async getFile() {
    if (this.hooks.failNextRead?.has(this.path)) {
      this.hooks.failNextRead.delete(this.path);
      throw new Error("transient read failure");
    }
    const data = this.node.data.slice();
    return {
      size: data.byteLength,
      arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
    };
  }
  async createWritable(): Promise<WritableLike> {
    const chunks: Uint8Array[] = [];
    const node = this.node;
    const path = this.path;
    const hooks = this.hooks;
    return {
      async write(data: BufferSource) {
        const view = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        chunks.push(view.slice());
      },
      async close() {
        if (hooks.failClose?.(path)) throw new DOMException("disk full", "QuotaExceededError");
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          out.set(c, off);
          off += c.byteLength;
        }
        node.data = out;
        if (hooks.corruptAfterClose?.(path) && out.byteLength > 0) node.data[0] = (node.data[0] ?? 0) ^ 0xff;
        if (hooks.failReadBackAfterWrite?.delete(path)) hooks.failNextRead?.add(path);
      },
      async abort() {
        chunks.length = 0;
      },
    };
  }
}

class MemDir implements DirHandleLike {
  readonly kind = "directory" as const;
  constructor(
    readonly name: string,
    private readonly node: { kind: "dir"; children: Map<string, Node> },
    private readonly path: string,
    private readonly hooks: FaultHooks,
  ) {}
  async *entries(): AsyncGenerator<[string, FileHandleLike | DirHandleLike]> {
    for (const [name, child] of this.node.children) {
      const childPath = this.path ? `${this.path}/${name}` : name;
      yield [name, child.kind === "file" ? new MemFile(name, childPath, child, this.hooks) : new MemDir(name, child, childPath, this.hooks)];
    }
  }
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike> {
    const child = this.node.children.get(name);
    const childPath = this.path ? `${this.path}/${name}` : name;
    if (child?.kind === "dir") throw new DOMException("is a directory", "TypeMismatchError");
    if (child?.kind === "file") return new MemFile(name, childPath, child, this.hooks);
    if (!opts?.create) throw notFound();
    const created: Node = { kind: "file", data: new Uint8Array(0) };
    this.node.children.set(name, created);
    return new MemFile(name, childPath, created, this.hooks);
  }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandleLike> {
    const child = this.node.children.get(name);
    const childPath = this.path ? `${this.path}/${name}` : name;
    if (child?.kind === "file") throw new DOMException("is a file", "TypeMismatchError");
    if (child?.kind === "dir") return new MemDir(name, child, childPath, this.hooks);
    if (!opts?.create) throw notFound();
    const created: Node = { kind: "dir", children: new Map() };
    this.node.children.set(name, created);
    return new MemDir(name, created, childPath, this.hooks);
  }
  async removeEntry(name: string): Promise<void> {
    if (!this.node.children.has(name)) throw notFound();
    this.node.children.delete(name);
  }
  async queryPermission(): Promise<"granted"> {
    return "granted";
  }
}

export function createMemoryFolder(hooks: FaultHooks = {}): DirHandleLike {
  return new MemDir("root", { kind: "dir", children: new Map() }, "", hooks);
}

/** Reads a path from the memory tree for assertions. Returns undefined when absent. */
export function readTree(root: DirHandleLike, path: string): Promise<Uint8Array | undefined> {
  const parts = path.split("/");
  const name = parts.pop() ?? "";
  return (async () => {
    let dir: DirHandleLike = root;
    for (const p of parts) {
      try {
        dir = await dir.getDirectoryHandle(p);
      } catch {
        return undefined;
      }
    }
    try {
      const handle = await dir.getFileHandle(name);
      return new Uint8Array(await (await handle.getFile()).arrayBuffer());
    } catch {
      return undefined;
    }
  })();
}

export async function listTree(root: DirHandleLike, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for await (const [name, handle] of root.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") out.push(path);
    else out.push(...(await listTree(handle as DirHandleLike, path)));
  }
  return out.sort();
}
