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
	stringArray,
	stringField,
	textContent,
	timestamp,
} from "./common.js";

const KNOWN_METADATA = new Set(["model_change", "thinking_level_change", "session_info", "label"]);

// DRAFT copy applies to warning details and normalized fallback text emitted by this reader.

export const piReader: ArchiveReader = {
	harness: "pi",
	version: 1,
	async read(unit) {
		const turns: PendingTurn[] = [];
		const turnKeys = new Set<string>();
		const issues: ParseIssue[] = [];
		const issueKeys = new Set<string>();
		const files: FileReadStatus[] = [];

		for (const file of unit.files) {
			const parsed = await parseJsonl(file);
			for (const issue of parsed.issues) {
				addIssue(issues, issueKeys, issue, `${issue.sourcePath}\0${issue.sourceLine}\0${issue.code}`);
			}
			if (parsed.corrupt || (parsed.validLines === 0 && parsed.invalidLines > 0)) {
				files.push({ path: file.path, status: "corrupt" });
				continue;
			}
			let project: string | null = null;
			let recognizedHeader = false;
			let supportedVersion = false;
			let filePartial = parsed.invalidLines > 0;
			for (const record of parsed.records) {
				const type = stringField(record.value, "type");
				const recordTimestamp = timestamp(record.value.timestamp);
				project = stringField(record.value, "cwd") ?? project;
				if (type === "session") {
					recognizedHeader = true;
					const version = record.value.version;
					supportedVersion = version === 1 || version === 2 || version === 3;
					project = stringField(record.value, "cwd") ?? project;
					if (!supportedVersion) {
						filePartial = true;
						addIssue(issues, issueKeys, {
							sourcePath: file.path,
							sourceLine: record.line,
							code: "unsupported-version",
							detail: `unsupported pi session version ${String(version)}`,
						});
					}
					continue;
				}
				if (!supportedVersion) {
					continue;
				}
				if (type === "message") {
					const message = asObject(record.value.message);
					const role = stringField(message, "role");
					const details = asObject(record.value.details) ?? asObject(message?.details);
					const filesTouched = [...stringArray(details?.readFiles), ...stringArray(details?.modifiedFiles)];
					if (role === "user" || role === "assistant" || role === "toolResult") {
						for (const text of textContent(message?.content)) {
							pushUniqueTurn(turns, turnKeys, {
								timestamp: recordTimestamp,
								project,
								role: role === "toolResult" ? "tool" : role,
								text,
								filesTouched: [...new Set(filesTouched)],
								commands: [],
								sourcePath: file.path,
								sourceLine: record.line,
							});
						}
						if (role === "assistant" && Array.isArray(message?.content)) {
							for (const rawBlock of message.content) {
								const block = asObject(rawBlock);
								if (block?.type !== "toolCall") {
									continue;
								}
								const name = stringField(block, "name");
								const input = asObject(block.arguments) ?? asObject(block.input);
								pushUniqueTurn(turns, turnKeys, {
									timestamp: recordTimestamp,
									project,
									role: "tool",
									text: name ?? "tool call",
									filesTouched: [...new Set([...filesTouched, ...explicitPaths(input)])],
									commands: shellCommands(name, input),
									sourcePath: file.path,
									sourceLine: record.line,
								});
							}
						}
					} else if (role === "bashExecution") {
						const command = stringField(message, "command");
						const output = stringField(message, "output");
						pushUniqueTurn(turns, turnKeys, {
							timestamp: recordTimestamp,
							project,
							role: "tool",
							text: output === null || output === "" ? (command ?? "bash execution") : output,
							filesTouched: [...new Set(filesTouched)],
							commands: command === null ? [] : [command],
							sourcePath: file.path,
							sourceLine: record.line,
						});
					} else {
						filePartial = true;
						addIssue(issues, issueKeys, {
							sourcePath: file.path,
							sourceLine: record.line,
							code: "unknown-content",
							detail: `skipped pi message role ${role ?? "<missing>"}`,
						});
					}
					continue;
				}
				if (type === "compaction" || type === "branch_summary") {
					const text = stringField(record.value, "summary") ?? stringField(record.value, "content");
					const details = asObject(record.value.details);
					const filesTouched = [...stringArray(details?.readFiles), ...stringArray(details?.modifiedFiles)];
					if (text !== null) {
						pushUniqueTurn(turns, turnKeys, {
							timestamp: recordTimestamp,
							project,
							role: "summary",
							text,
							filesTouched: [...new Set(filesTouched)],
							commands: [],
							sourcePath: file.path,
							sourceLine: record.line,
						});
					}
					continue;
				}
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
			}
			const status = !recognizedHeader || !supportedVersion ? "unsupported" : filePartial ? "partial" : "ok";
			files.push({ path: file.path, status });
			if (!recognizedHeader) {
				addIssue(issues, issueKeys, {
					sourcePath: file.path,
					sourceLine: null,
					code: "unsupported-structure",
					detail: "no recognizable pi session header",
				});
			}
		}
		return { turns: finishTurns(turns), issues, files };
	},
};
