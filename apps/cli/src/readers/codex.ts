import type { ArchiveReader, FileReadStatus, ParseIssue, ReadRole } from "../retrieval/types.js";
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

// DRAFT copy applies to warning details and normalized fallback text emitted by this reader.

function structuredInput(value: unknown): Record<string, unknown> | null {
	if (typeof value === "string") {
		try {
			return asObject(JSON.parse(value));
		} catch {
			return null;
		}
	}
	return asObject(value);
}

function eventText(payload: Record<string, unknown>): { role: ReadRole; text: string } | null {
	const type = stringField(payload, "type");
	if (type === "user_message") {
		return { role: "user", text: stringField(payload, "message") ?? "" };
	}
	if (type === "agent_message") {
		return { role: "assistant", text: stringField(payload, "message") ?? "" };
	}
	return null;
}

export const codexReader: ArchiveReader = {
	harness: "codex",
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
			let recognized = false;
			let filePartial = parsed.invalidLines > 0;
			const canonicalMessages = new Set<string>();
			const deferredEvents: PendingTurn[] = [];
			for (const record of parsed.records) {
				const type = stringField(record.value, "type");
				const payload = asObject(record.value.payload);
				const recordTimestamp = timestamp(record.value.timestamp);
				project = stringField(record.value, "cwd") ?? project;
				if (type === "session_meta") {
					recognized = true;
					project = stringField(payload, "cwd") ?? project;
					const embeddedId = stringField(payload, "id");
					if (embeddedId !== null && embeddedId !== unit.id) {
						filePartial = true;
						addIssue(issues, issueKeys, {
							sourcePath: file.path,
							sourceLine: record.line,
							code: "identity-mismatch",
							detail: `session id ${embeddedId} does not match archive unit ${unit.id}`,
						});
					}
					continue;
				}
				if (type === "turn_context") {
					recognized = true;
					project = stringField(payload, "cwd") ?? project;
					continue;
				}
				if (type === "response_item") {
					recognized = true;
					const itemType = stringField(payload, "type");
					if (itemType === "message") {
						const rawRole = stringField(payload, "role");
						const role = rawRole === "user" ? "user" : rawRole === "assistant" ? "assistant" : null;
						if (role !== null) {
							for (const text of textContent(payload?.content)) {
								canonicalMessages.add(`${role}\0${text}\0${recordTimestamp ?? ""}`);
								pushUniqueTurn(turns, turnKeys, {
									timestamp: recordTimestamp,
									project,
									role,
									text,
									filesTouched: [],
									commands: [],
									sourcePath: file.path,
									sourceLine: record.line,
								});
							}
						}
					} else if (itemType === "function_call" || itemType === "custom_tool_call") {
						const name = stringField(payload, "name");
						const input = structuredInput(payload?.arguments ?? payload?.input);
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
					} else if (itemType === "function_call_output" || itemType === "custom_tool_call_output") {
						for (const text of textContent(payload?.output)) {
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
					} else if (
						!["reasoning", "tool_search_call", "tool_search_output", "agent_message"].includes(itemType ?? "")
					) {
						filePartial = true;
						addIssue(issues, issueKeys, {
							sourcePath: file.path,
							sourceLine: record.line,
							code: "unknown-content",
							detail: `skipped response item type ${itemType ?? "<missing>"}`,
						});
					}
					continue;
				}
				if (type === "event_msg") {
					recognized = true;
					const event = payload === null ? null : eventText(payload);
					if (event !== null && event.text !== "") {
						deferredEvents.push({
							timestamp: recordTimestamp,
							project,
							role: event.role,
							text: event.text,
							filesTouched: [],
							commands: [],
							sourcePath: file.path,
							sourceLine: record.line,
						});
					}
					continue;
				}
				if (type === "compacted") {
					recognized = true;
					const text = stringField(payload, "message");
					if (text !== null) {
						pushUniqueTurn(turns, turnKeys, {
							timestamp: recordTimestamp,
							project,
							role: "summary",
							text,
							filesTouched: [],
							commands: [],
							sourcePath: file.path,
							sourceLine: record.line,
						});
					}
					continue;
				}
				if (type === "world_state" || type === "inter_agent_communication_metadata") {
					recognized = true;
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
			for (const event of deferredEvents) {
				if (!canonicalMessages.has(`${event.role}\0${event.text}\0${event.timestamp ?? ""}`)) {
					pushUniqueTurn(turns, turnKeys, event);
				}
			}
			files.push({ path: file.path, status: recognized ? (filePartial ? "partial" : "ok") : "unsupported" });
			if (!recognized) {
				addIssue(issues, issueKeys, {
					sourcePath: file.path,
					sourceLine: null,
					code: "unsupported-structure",
					detail: "no recognized Codex session records",
				});
			}
		}
		return { turns: finishTurns(turns), issues, files };
	},
};
