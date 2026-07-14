import type { HarnessId } from "../adapters/adapter.js";
import type { ArchiveReader } from "../retrieval/types.js";
import { claudeCodeReader } from "./claude-code.js";
import { codexReader } from "./codex.js";
import { piReader } from "./pi.js";

export const readers: readonly ArchiveReader[] = [claudeCodeReader, codexReader, piReader];

const byHarness = new Map<HarnessId, ArchiveReader>(readers.map((reader) => [reader.harness, reader]));

export function getReader(harness: HarnessId): ArchiveReader {
	return byHarness.get(harness)!;
}
