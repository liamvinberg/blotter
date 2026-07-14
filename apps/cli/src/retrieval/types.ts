import type { FileRole, HarnessId } from "../adapters/adapter.js";

export type ReadRole = "user" | "assistant" | "tool" | "summary";
export type ParseStatus = "ok" | "partial" | "unsupported" | "corrupt";

export interface ArchivedRetrievalFile {
	path: string;
	archivePath: string;
	machine: string;
	harness: HarnessId;
	unit: string;
	role: FileRole;
	storedSize: number;
	storedMtimeMs: number;
	archiveSha256: string | null;
}

export interface ArchivedRetrievalUnit {
	key: string;
	machine: string;
	harness: HarnessId;
	id: string;
	files: ArchivedRetrievalFile[];
}

export interface ParseIssue {
	sourcePath: string;
	sourceLine: number | null;
	code: string;
	detail: string;
}

export interface ReadTurn {
	turn: number;
	timestamp: string | null;
	project: string | null;
	role: ReadRole;
	text: string;
	filesTouched: string[];
	commands: string[];
	sourcePath: string;
	sourceLine: number;
}

export interface FileReadStatus {
	path: string;
	status: ParseStatus;
}

export interface ReadUnitResult {
	turns: ReadTurn[];
	issues: ParseIssue[];
	files: FileReadStatus[];
}

export interface ArchiveReader {
	harness: HarnessId;
	version: number;
	read(unit: ArchivedRetrievalUnit): Promise<ReadUnitResult>;
}
