import { resolve } from "node:path";
import { HARNESS_IDS, type HarnessId, isHarnessId } from "../adapters/adapter.js";
import { loadConfig } from "../core/config.js";
import { resolveHome } from "../core/home.js";
import { withRetrievalLock } from "../core/lock.js";
import { assertFts5, closeDatabase, openAndRefresh } from "../retrieval/database.js";
import { listSessions, type SessionFilters, type SessionSummary } from "../retrieval/sessions.js";

// DRAFT copy. Usage is pinned byte-for-byte by the retrieval contract.
const USAGE =
	"Usage: packbat sessions [--project <path>] [--since <RFC3339>] [--harness <id>] [--machine <name>] [--file <substring>] [--command <substring>] [--limit <n>] [--json]\n";

interface SessionsOptions {
	project: string | null;
	since: string | null;
	harness: HarnessId | null;
	machine: string | null;
	file: string | null;
	command: string | null;
	limit: number;
	json: boolean;
}

function usageError(message: string): null {
	// DRAFT copy
	process.stderr.write(`packbat sessions: ${message}\n\n${USAGE}`);
	return null;
}

function optionValue(argv: string[], index: number, option: string): string | null {
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("--")) {
		usageError(`${option} requires a value`);
		return null;
	}
	return value;
}

function parseSince(value: string): string | null {
	const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
	if (date === null) return null;
	const year = Number(date[1]);
	const month = Number(date[2]);
	const day = Number(date[3]);
	if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		const parsed = new Date(`${value}T00:00:00.000Z`);
		return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
	}
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
		return null;
	}
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseOptions(argv: string[]): SessionsOptions | null {
	// DRAFT copy applies to validation messages passed to usageError below.
	const options: SessionsOptions = {
		project: null,
		since: null,
		harness: null,
		machine: null,
		file: null,
		command: null,
		limit: 20,
		json: false,
	};
	let limitPassed = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]!;
		if (argument === "--json") {
			if (options.json) return usageError("--json may only be passed once");
			options.json = true;
		} else if (argument === "--project") {
			if (options.project !== null) return usageError("--project may only be passed once");
			const value = optionValue(argv, index, argument);
			if (value === null) return null;
			options.project = resolve(value);
			index += 1;
		} else if (argument === "--since") {
			if (options.since !== null) return usageError("--since may only be passed once");
			const value = optionValue(argv, index, argument);
			if (value === null) return null;
			const since = parseSince(value);
			if (since === null) return usageError("--since must be RFC3339 or YYYY-MM-DD");
			options.since = since;
			index += 1;
		} else if (argument === "--harness") {
			if (options.harness !== null) return usageError("--harness may only be passed once");
			const value = optionValue(argv, index, argument);
			if (value === null) return null;
			if (!isHarnessId(value)) return usageError(`--harness must be one of ${HARNESS_IDS.join(", ")}`);
			options.harness = value;
			index += 1;
		} else if (argument === "--machine") {
			if (options.machine !== null) return usageError("--machine may only be passed once");
			const value = optionValue(argv, index, argument);
			if (value === null) return null;
			options.machine = value;
			index += 1;
		} else if (argument === "--file") {
			if (options.file !== null) return usageError("--file may only be passed once");
			const value = optionValue(argv, index, argument);
			if (value === null) return null;
			options.file = value;
			index += 1;
		} else if (argument === "--command") {
			if (options.command !== null) return usageError("--command may only be passed once");
			const value = optionValue(argv, index, argument);
			if (value === null) return null;
			options.command = value;
			index += 1;
		} else if (argument === "--limit") {
			if (limitPassed) return usageError("--limit may only be passed once");
			const value = optionValue(argv, index, argument);
			if (value === null) return null;
			const limit = Number(value);
			if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
				return usageError("--limit must be an integer from 1 to 200");
			}
			options.limit = limit;
			limitPassed = true;
			index += 1;
		} else {
			return usageError(`unknown option ${argument}`);
		}
	}
	return options;
}

function printSessions(sessions: SessionSummary[], truncated: boolean, limit: number): void {
	// DRAFT copy
	if (sessions.length === 0) {
		process.stdout.write("no sessions matched\n");
	} else {
		const blocks = sessions.map((session) => {
			const lines = [
				`${session.key} · ${session.startedAt ?? "-"}→${session.updatedAt ?? "-"} · ${session.turns} turns`,
			];
			if (session.projects.length > 0) lines.push(`projects: ${session.projects.join(", ")}`);
			if (session.head !== null) lines.push(`"${session.head}"`);
			return lines.join("\n");
		});
		process.stdout.write(`${blocks.join("\n\n")}\n`);
	}
	if (truncated) {
		process.stdout.write(`showing ${limit} of more · narrow with filters or raise --limit\n`);
	}
}

export async function runSessions(argv: string[]): Promise<number> {
	const options = parseOptions(argv);
	if (options === null) return 1;
	assertFts5();
	const home = resolveHome();
	const config = loadConfig(home);
	const locked = await withRetrievalLock(home.statePath, async () => {
		const database = await openAndRefresh(home, config);
		try {
			const filters: SessionFilters = {
				project: options.project,
				since: options.since,
				harness: options.harness,
				machine: options.machine,
				file: options.file,
				command: options.command,
			};
			const result = listSessions(database, filters, options.limit);
			if (options.json) {
				process.stdout.write(`${JSON.stringify({ v: 1, filters, ...result })}\n`);
			} else {
				printSessions(result.sessions, result.truncated, options.limit);
			}
			return 0;
		} finally {
			closeDatabase(database);
		}
	});
	if (!locked.acquired) {
		// DRAFT copy
		process.stderr.write("packbat sessions: retrieval is already running\n");
		return 1;
	}
	return locked.value;
}
