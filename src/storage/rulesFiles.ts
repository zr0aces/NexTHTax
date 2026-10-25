import { type DirHandleLike, isNotFound, listNames, resolveDir } from "./fs";

/** Sums byte sizes of pinned rule snapshots under rules/<year>/. Missing rules/ folder counts as zero. */
export async function ruleBytesIn(root: DirHandleLike): Promise<number> {
  let total = 0;
  let rulesDir: DirHandleLike;
  try {
    rulesDir = await resolveDir(root, ["rules"], false);
  } catch (err) {
    if (isNotFound(err)) return 0;
    throw err;
  }
  for (const year of await listNames(rulesDir)) {
    if (year.kind !== "directory") continue;
    const yearDir = await resolveDir(rulesDir, [year.name], false);
    for (const file of await listNames(yearDir)) {
      if (file.kind !== "file") continue;
      const handle = await yearDir.getFileHandle(file.name);
      total += (await handle.getFile()).size;
    }
  }
  return total;
}
