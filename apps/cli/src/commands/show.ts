import { loadConfig } from "../core/config.js";
import { resolveHome } from "../core/home.js";
import { readArchiveCatalog } from "../retrieval/catalog.js";
import { assertFts5 } from "../retrieval/database.js";
import { parseTurnRange, type RequestedTurnRange, TurnRangeError } from "../retrieval/range.js";
import { readShowUnit, resolveShowUnit, type ShowResult } from "../retrieval/show.js";

// DRAFT copy. Usage is pinned byte-for-byte by the retrieval contract.
const USAGE = "Usage: packbat show <unit-or-key> [--turns <a:b>] [--all] [--json]\n";

function parseOptions(
	argv: string[],
): { value: string; range: RequestedTurnRange | null; all: boolean; json: boolean } | null {
	let value: string | null = null;
	let range: RequestedTurnRange | null = null;
	let all = false;
	let json = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]!;
		if (argument === "--json") {
			if (json) {
				// DRAFT copy
				process.stderr.write(`packbat show: --json may only be passed once\n\n${USAGE}`);
				return null;
			}
			json = true;
		} else if (argument === "--all") {
			if (all) {
				// DRAFT copy
				process.stderr.write(`packbat show: --all may only be passed once\n\n${USAGE}`);
				return null;
			}
			all = true;
		} else if (argument === "--turns") {
			if (range !== null) {
				// DRAFT copy
				process.stderr.write(`packbat show: --turns may only be passed once\n\n${USAGE}`);
				return null;
			}
			const rawRange = argv[index + 1];
			if (rawRange === undefined || rawRange.startsWith("--")) {
				// DRAFT copy
				process.stderr.write(`packbat show: --turns requires a range\n\n${USAGE}`);
				return null;
			}
			try {
				range = parseTurnRange(rawRange);
			} catch (error) {
				if (!(error instanceof TurnRangeError)) throw error;
				// DRAFT copy
				process.stderr.write(`packbat show: ${error.message}\n\n${USAGE}`);
				return null;
			}
			index += 1;
		} else if (argument.startsWith("-")) {
			// DRAFT copy
			process.stderr.write(`packbat show: unknown option ${argument}\n\n${USAGE}`);
			return null;
		} else if (value !== null) {
			// DRAFT copy
			process.stderr.write(`packbat show: only one unit or key may be passed\n\n${USAGE}`);
			return null;
		} else {
			value = argument;
		}
	}
	if (value === null) {
		// DRAFT copy
		process.stderr.write(`packbat show: a unit or key is required\n\n${USAGE}`);
		return null;
	}
	return { value, range, all, json };
}

function printShow(result: ShowResult, localMachine: string): void {
	// DRAFT copy
	process.stdout.write(`${result.unit.key}\n`);
	process.stdout.write(`${result.unit.harness} · ${result.unit.machine}\n`);
	if (result.unit.projects.length > 0) process.stdout.write(`projects: ${result.unit.projects.join(", ")}\n`);
	for (const turn of result.turns) {
		process.stdout.write(`\n${turn.turn} · ${turn.role}`);
		if (turn.timestamp !== null) process.stdout.write(` · ${turn.timestamp}`);
		if (turn.project !== null) process.stdout.write(` · ${turn.project}`);
		process.stdout.write(`\n${turn.text}\n`);
		if (turn.filesTouched.length > 0) process.stdout.write(`files: ${turn.filesTouched.join(", ")}\n`);
		if (turn.commands.length > 0) process.stdout.write(`commands: ${turn.commands.join(" | ")}\n`);
	}
	if (result.truncated && result.next !== null) {
		// DRAFT copy
		process.stdout.write(
			`\noutput truncated at turn ${result.range.to} · continue with packbat show ${result.unit.key} --turns ${result.next.from}:${result.next.to}\n`,
		);
	}
	const machineFlag = result.unit.machine === localMachine ? "" : `--machine ${result.unit.machine} `;
	// DRAFT copy
	process.stdout.write(`\nRestore this session with packbat restore ${machineFlag}${result.unit.id}\n`);
}

export async function runShow(argv: string[]): Promise<number> {
	const options = parseOptions(argv);
	if (options === null) return 1;
	assertFts5();
	const home = resolveHome();
	const config = loadConfig(home);
	// show reads raw archives, never the cache, so it takes no retrieval lock.
	const unit = resolveShowUnit(await readArchiveCatalog(config), options.value);
	let result: ShowResult;
	try {
		result = await readShowUnit(unit, options.range, options.all);
	} catch (error) {
		if (!(error instanceof TurnRangeError)) throw error;
		// DRAFT copy
		process.stderr.write(`packbat show: ${error.message}\n\n${USAGE}`);
		return 1;
	}
	if (options.json) process.stdout.write(`${JSON.stringify(result)}\n`);
	else printShow(result, config.machine);
	return 0;
}
