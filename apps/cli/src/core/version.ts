import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PackbatError } from "./errors.js";

// Resolves from both layouts this module runs in: dist/*.js (bundle root, one
// level below the package manifest) and src/core/*.ts under tsx (two levels).
export function packbatVersion(): string {
	for (const candidate of ["../package.json", "../../package.json"]) {
		const path = fileURLToPath(new URL(candidate, import.meta.url));
		if (!existsSync(path)) {
			continue;
		}
		const parsed = JSON.parse(readFileSync(path, "utf8")) as { name?: string; version?: string };
		if (parsed.name === "packbat" && typeof parsed.version === "string") {
			return parsed.version;
		}
	}
	throw new PackbatError("packbat could not determine its own version"); // DRAFT copy
}
