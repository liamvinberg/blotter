import { relative } from "node:path";
import { statOrNull } from "../core/fs.js";
import type { FileRole, SessionFile } from "./adapter.js";

/** Stat one store path into a SessionFile, or null when it is absent or not a file. */
export async function toSessionFile(storeRoot: string, absPath: string, role: FileRole): Promise<SessionFile | null> {
	const stats = await statOrNull(absPath);
	if (stats === null || !stats.isFile()) {
		return null;
	}
	return {
		absPath,
		relPath: relative(storeRoot, absPath),
		role,
		sizeBytes: stats.size,
		mtimeMs: stats.mtimeMs,
	};
}
