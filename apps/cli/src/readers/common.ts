import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createZstdDecompress } from "node:zlib";
import type { ArchivedRetrievalFile, ParseIssue, ReadRole, ReadTurn } from "../retrieval/types.js";

const MAX_ISSUES = 100;

// DRAFT copy applies to normalized fallback text and parse-issue detail strings in this reader pipeline.

export interface JsonRecord {
	value: Record<string, unknown>;
	line: number;
}

export interface ParsedJsonl {
	records: JsonRecord[];
	issues: ParseIssue[];
	invalidLines: number;
	validLines: number;
	corrupt: boolean;
}

export interface PendingTurn {
	timestamp: string | null;
	project: string | null;
	role: ReadRole;
	text: string;
	filesTouched: string[];
	commands: string[];
	sourcePath: string;
	sourceLine: number;
}

export function asObject(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function stringField(object: Record<string, unknown> | null, key: string): string | null {
	const value = object?.[key];
	return typeof value === "string" ? value : null;
}

export function timestamp(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const milliseconds = Date.parse(value);
	return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString();
}

export function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return [...new Set(value.filter((item): item is string => typeof item === "string"))];
}

export function textContent(value: unknown): string[] {
	if (typeof value === "string") {
		return value === "" ? [] : [value];
	}
	if (!Array.isArray(value)) {
		return [];
	}
	const texts: string[] = [];
	for (const item of value) {
		const block = asObject(item);
		if (block?.type === "text" && typeof block.text === "string" && block.text !== "") {
			texts.push(block.text);
		} else if (block?.type === "input_text" && typeof block.text === "string" && block.text !== "") {
			texts.push(block.text);
		} else if (block?.type === "output_text" && typeof block.text === "string" && block.text !== "") {
			texts.push(block.text);
		}
	}
	return [...new Set(texts)];
}

export function addIssue(
	issues: ParseIssue[],
	seen: Set<string>,
	issue: ParseIssue,
	dedupeKey = `${issue.code}\0${issue.detail}`,
): void {
	if (issues.length >= MAX_ISSUES || seen.has(dedupeKey)) {
		return;
	}
	seen.add(dedupeKey);
	issues.push(issue);
}

export async function parseJsonl(file: ArchivedRetrievalFile): Promise<ParsedJsonl> {
	const records: JsonRecord[] = [];
	const issues: ParseIssue[] = [];
	let invalidLines = 0;
	let line = 0;
	try {
		const decompressor = createZstdDecompress();
		const input = createReadStream(file.archivePath);
		const lines = createInterface({ input: input.pipe(decompressor), crlfDelay: Number.POSITIVE_INFINITY });
		for await (const contents of lines) {
			line += 1;
			if (contents.trim() === "") {
				continue;
			}
			try {
				const value: unknown = JSON.parse(contents);
				const object = asObject(value);
				if (object === null) {
					invalidLines += 1;
					issues.push({
						sourcePath: file.path,
						sourceLine: line,
						code: "invalid-record",
						detail: "skipped JSON value that is not an object",
					});
				} else {
					records.push({ value: object, line });
				}
			} catch {
				invalidLines += 1;
				if (issues.length < MAX_ISSUES) {
					issues.push({
						sourcePath: file.path,
						sourceLine: line,
						code: "malformed-json",
						detail: "skipped malformed JSONL record",
					});
				}
			}
		}
		return { records, issues, invalidLines, validLines: records.length, corrupt: false };
	} catch (error) {
		return {
			records,
			issues: [
				...issues,
				{
					sourcePath: file.path,
					sourceLine: null,
					code: "zstd-corrupt",
					detail: `could not decompress archive: ${error instanceof Error ? error.message : String(error)}`,
				},
			],
			invalidLines,
			validLines: records.length,
			corrupt: true,
		};
	}
}

export function finishTurns(turns: PendingTurn[]): ReadTurn[] {
	turns.sort((left, right) => {
		if (left.timestamp === null && right.timestamp !== null) {
			return 1;
		}
		if (left.timestamp !== null && right.timestamp === null) {
			return -1;
		}
		return (
			(left.timestamp?.localeCompare(right.timestamp ?? "") ?? 0) ||
			left.sourcePath.localeCompare(right.sourcePath) ||
			left.sourceLine - right.sourceLine
		);
	});
	return turns.map((turn, index) => ({ ...turn, turn: index }));
}

export function pushUniqueTurn(turns: PendingTurn[], seen: Set<string>, turn: PendingTurn): void {
	if (turn.text === "") {
		return;
	}
	const key = `${turn.sourcePath}\0${turn.sourceLine}\0${turn.role}\0${turn.text}\0${JSON.stringify(turn.filesTouched)}\0${JSON.stringify(turn.commands)}`;
	if (!seen.has(key)) {
		seen.add(key);
		turns.push(turn);
	}
}

export function explicitPaths(input: Record<string, unknown> | null): string[] {
	if (input === null) {
		return [];
	}
	const paths: string[] = [];
	for (const key of ["file_path", "path", "filepath", "absolute_path"]) {
		const value = input[key];
		if (typeof value === "string") {
			paths.push(value);
		}
	}
	for (const key of ["files", "paths", "file_paths"]) {
		paths.push(...stringArray(input[key]));
	}
	return [...new Set(paths)];
}

export function shellCommands(name: string | null, input: Record<string, unknown> | null): string[] {
	if (name === null || input === null || !/^(bash|shell|exec|exec_command)$/i.test(name)) {
		return [];
	}
	for (const key of ["command", "cmd", "script"]) {
		const value = input[key];
		if (typeof value === "string") {
			return [value];
		}
	}
	return [];
}
