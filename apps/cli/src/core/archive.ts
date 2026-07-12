import { mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { HarnessId, SessionUnit } from "../adapters/adapter.js";
import { adapters } from "../adapters/registry.js";
import { compressFile } from "./compress.js";
import type { BlotterConfig } from "./config.js";
import { type ArchiveIndexRecord, appendIndex, readIndex } from "./index.js";

export interface ArchiveDecision {
	sourceMtimeMs: number;
	sourceSize: number;
	stored: { mtimeMs: number } | null;
	indexSourceSize: number | undefined;
}

export interface ArchiveCounts {
	archived: number;
	unchanged: number;
	failed: number;
}

export interface SweepResult extends ArchiveCounts {
	perHarness: Record<HarnessId, ArchiveCounts>;
	errors: string[];
}

export function shouldArchive(decision: ArchiveDecision): boolean {
	if (decision.stored === null) {
		return true;
	}
	if (decision.sourceMtimeMs > decision.stored.mtimeMs) {
		return true;
	}
	return (
		decision.sourceMtimeMs === decision.stored.mtimeMs &&
		decision.indexSourceSize !== undefined &&
		decision.sourceSize !== decision.indexSourceSize
	);
}

async function storedFile(path: string): Promise<{ mtimeMs: number } | null> {
	try {
		const storedStat = await stat(path);
		return { mtimeMs: storedStat.mtimeMs };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

function emptyCounts(): ArchiveCounts {
	return { archived: 0, unchanged: 0, failed: 0 };
}

function increment(result: SweepResult, harness: HarnessId, field: keyof ArchiveCounts): void {
	result[field] += 1;
	result.perHarness[harness][field] += 1;
}

function userHome(env: NodeJS.ProcessEnv): string {
	const configured = env.HOME?.trim();
	return configured ? configured : homedir();
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function sweep(config: BlotterConfig, env: NodeJS.ProcessEnv): Promise<SweepResult> {
	const result: SweepResult = {
		...emptyCounts(),
		perHarness: {
			"claude-code": emptyCounts(),
			codex: emptyCounts(),
			pi: emptyCounts(),
		},
		errors: [],
	};
	const machinePath = join(config.archiveRoot, config.machine);
	const indexPath = join(machinePath, "index.jsonl");
	const index = await readIndex(indexPath);

	for (const adapter of adapters) {
		let units: SessionUnit[];
		try {
			units = await adapter.enumerate(adapter.storeRoot(env, userHome(env)));
		} catch (error) {
			increment(result, adapter.id, "failed");
			result.errors.push(`${adapter.id}: could not enumerate store: ${errorMessage(error)}`);
			continue;
		}
		for (const unit of units) {
			for (const file of unit.files) {
				const relativePath = join(adapter.id, `${file.relPath}.zst`);
				const destination = join(machinePath, relativePath);
				try {
					const currentIndexRecord = index.records.get(relativePath);
					if (
						!shouldArchive({
							sourceMtimeMs: file.mtimeMs,
							sourceSize: file.sizeBytes,
							stored: await storedFile(destination),
							indexSourceSize: currentIndexRecord?.sourceSize,
						})
					) {
						increment(result, adapter.id, "unchanged");
						continue;
					}
					await mkdir(dirname(destination), { recursive: true });
					const compressed = await compressFile(file.absPath, destination);
					const record: ArchiveIndexRecord = {
						v: 1,
						path: relativePath,
						harness: adapter.id,
						machine: config.machine,
						unit: unit.id,
						role: file.role,
						source: file.absPath,
						sourceMtimeMs: compressed.sourceMtimeMs,
						sourceSize: compressed.sourceSize,
						storedSize: compressed.storedSize,
						sha256: compressed.sha256,
						archivedAt: new Date().toISOString(),
					};
					await appendIndex(indexPath, record);
					index.records.set(relativePath, record);
					increment(result, adapter.id, "archived");
				} catch (error) {
					increment(result, adapter.id, "failed");
					result.errors.push(`${adapter.id}: ${file.absPath}: ${errorMessage(error)}`);
				}
			}
		}
	}
	return result;
}
