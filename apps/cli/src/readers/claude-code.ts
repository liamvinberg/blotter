import type { ArchiveReader, FileReadStatus, ParseIssue } from "../retrieval/types.js";
import {
	addIssue,
	asObject,
	explicitPaths,
	finishTurns,
	type PendingTurn,
	parseJsonl,
	pushUniqueTurn,
	shellCommands,
	stringField,
	textContent,
	timestamp,
} from "./common.js";

const KNOWN_METADATA = new Set([
	"agent-name",
	"ai-title",
	"attachment",
	"bridge-session",
	"custom-title",
	"file-history-snapshot",
	"last-prompt",
	"mode",
	"permission-mode",
	"pr-link",
	"queue-operation",
	"relocated",
	"system",
	"worktree-state",
]);

// DRAFT copy applies to warning details and normalized fallback text emitted by this reader.

export const claudeCodeReader: ArchiveReader = {
	harness: "claude-code",
	version: 1,
	async read(unit) {
		const turns: PendingTurn[] = [];
		const turnKeys = new Set<string>();
		const issues: ParseIssue[] = [];
		const issueKeys = new Set<string>();
		const files: FileReadStatus[] = [];

		for (const file of unit.files) {
			if (!file.path.endsWith(".jsonl.zst")) {
				files.push({ path: file.path, status: "ok" });
				continue;
			}
			const parsed = await parseJsonl(file);
			for (const issue of parsed.issues) {
				addIssue(issues, issueKeys, issue, `${issue.sourcePath}\0${issue.sourceLine}\0${issue.code}`);
			}
			if (parsed.corrupt || (parsed.validLines === 0 && parsed.invalidLines > 0)) {
				files.push({ path: file.path, status: "corrupt" });
				continue;
			}
			let project: string | null = null;
			let recognized = false;
			let filePartial = parsed.invalidLines > 0;
			for (const record of parsed.records) {
				const type = stringField(record.value, "type");
				const ownProject = stringField(record.value, "cwd");
				if (ownProject !== null) {
					project = ownProject;
				}
				if (type !== "user" && type !== "assistant") {
					if (type !== null && KNOWN_METADATA.has(type)) {
						continue;
					}
					filePartial = true;
					addIssue(issues, issueKeys, {
						sourcePath: file.path,
						sourceLine: record.line,
						code: "unknown-record",
						detail: `skipped record type ${type ?? "<missing>"}`,
					});
					continue;
				}
				recognized = true;
				const embeddedId = stringField(record.value, "sessionId");
				if (embeddedId !== null && embeddedId !== unit.id) {
					filePartial = true;
					addIssue(issues, issueKeys, {
						sourcePath: file.path,
						sourceLine: record.line,
						code: "identity-mismatch",
						detail: `session id ${embeddedId} does not match archive unit ${unit.id}`,
					});
				}
				const recordTimestamp = timestamp(record.value.timestamp);
				const message = asObject(record.value.message);
				const role = type === "user" ? "user" : "assistant";
				const isSummary = record.value.isCompactSummary === true;
				for (const text of textContent(message?.content)) {
					pushUniqueTurn(turns, turnKeys, {
						timestamp: recordTimestamp,
						project,
						role: isSummary ? "summary" : role,
						text,
						filesTouched: [],
						commands: [],
						sourcePath: file.path,
						sourceLine: record.line,
					});
				}
				if (!Array.isArray(message?.content)) {
					continue;
				}
				for (const rawBlock of message.content) {
					const block = asObject(rawBlock);
					const blockType = stringField(block, "type");
					if (blockType === "tool_use") {
						const name = stringField(block, "name");
						const input = asObject(block?.input);
						pushUniqueTurn(turns, turnKeys, {
							timestamp: recordTimestamp,
							project,
							role: "tool",
							text: name ?? "tool call",
							filesTouched: explicitPaths(input),
							commands: shellCommands(name, input),
							sourcePath: file.path,
							sourceLine: record.line,
						});
					} else if (blockType === "tool_result") {
						for (const text of textContent(block?.content)) {
							pushUniqueTurn(turns, turnKeys, {
								timestamp: recordTimestamp,
								project,
								role: "tool",
								text,
								filesTouched: [],
								commands: [],
								sourcePath: file.path,
								sourceLine: record.line,
							});
						}
					} else if (!["text", "thinking", "image", "document", "fallback"].includes(blockType ?? "")) {
						filePartial = true;
						addIssue(issues, issueKeys, {
							sourcePath: file.path,
							sourceLine: record.line,
							code: "unknown-content",
							detail: `skipped content type ${blockType ?? "<missing>"}`,
						});
					}
				}
			}
			files.push({
				path: file.path,
				status: recognized ? (filePartial ? "partial" : "ok") : "unsupported",
			});
			if (!recognized) {
				addIssue(issues, issueKeys, {
					sourcePath: file.path,
					sourceLine: null,
					code: "unsupported-structure",
					detail: "no recognized Claude Code session records",
				});
			}
		}
		return { turns: finishTurns(turns), issues, files };
	},
};
