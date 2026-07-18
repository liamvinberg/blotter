import { loadConfig } from "../core/config.js";
import { resolveHome } from "../core/home.js";
import { readArchiveCatalog } from "../retrieval/catalog.js";
import { assertFts5 } from "../retrieval/database.js";
import { parseTurnRange, type RequestedTurnRange, TurnRangeError } from "../retrieval/range.js";
import { type OutlineReadResult, readOutlineUnit, resolveShowUnit } from "../retrieval/show.js";

// DRAFT copy. Usage is pinned byte-for-byte by the retrieval contract.
const USAGE = "Usage: packbat outline <unit-or-key> [--turns <a:b>] [--json]\n";

function parseOptions(argv: string[]): { value: string; range: RequestedTurnRange | null; json: boolean } | null {
	let value: string | null = null;
	let range: RequestedTurnRange | null = null;
	let json = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index]!;
		if (argument === "--json") {
			if (json) {
				// DRAFT copy
				process.stderr.write(`packbat outline: --json may only be passed once\n\n${USAGE}`);
				return null;
			}
			json = true;
		} else if (argument === "--turns") {
			if (range !== null) {
				// DRAFT copy
				process.stderr.write(`packbat outline: --turns may only be passed once\n\n${USAGE}`);
				return null;
			}
			const rawRange = argv[index + 1];
			if (rawRange === undefined || rawRange.startsWith("--")) {
				// DRAFT copy
				process.stderr.write(`packbat outline: --turns requires a range\n\n${USAGE}`);
				return null;
			}
			try {
				range = parseTurnRange(rawRange);
			} catch (error) {
				if (!(error instanceof TurnRangeError)) throw error;
				// DRAFT copy
				process.stderr.write(`packbat outline: ${error.message}\n\n${USAGE}`);
				return null;
			}
			index += 1;
		} else if (argument.startsWith("-")) {
			// DRAFT copy
			process.stderr.write(`packbat outline: unknown option ${argument}\n\n${USAGE}`);
			return null;
		} else if (value !== null) {
			// DRAFT copy
			process.stderr.write(`packbat outline: only one unit or key may be passed\n\n${USAGE}`);
			return null;
		} else {
			value = argument;
		}
	}
	if (value === null) {
		// DRAFT copy
		process.stderr.write(`packbat outline: a unit or key is required\n\n${USAGE}`);
		return null;
	}
	return { value, range, json };
}

function printOutline(read: OutlineReadResult): void {
	const { result } = read;
	// DRAFT copy
	process.stdout.write(`${result.unit.key}\n`);
	process.stdout.write(`${result.unit.harness} · ${result.unit.machine}\n`);
	if (result.unit.projects.length > 0) process.stdout.write(`projects: ${result.unit.projects.join(", ")}\n`);
	if (result.unit.startedAt !== null && result.unit.updatedAt !== null) {
		process.stdout.write(`span ${result.unit.startedAt}→${result.unit.updatedAt}\n`);
	}
	process.stdout.write(`${read.totalTurns} turns · ${read.totalChars} chars\n`);
	for (const turn of result.turns) {
		process.stdout.write(
			`${turn.turn} · ${turn.role} · ${turn.timestamp ?? "-"} · ${turn.chars} chars · ${turn.head}\n`,
		);
	}
	if (result.truncated && result.next !== null) {
		// DRAFT copy
		process.stdout.write(
			`output truncated at turn ${result.range.to} · continue with packbat outline ${result.unit.key} --turns ${result.next.from}:${result.next.to}\n`,
		);
	}
}

export async function runOutline(argv: string[]): Promise<number> {
	const options = parseOptions(argv);
	if (options === null) return 1;
	assertFts5();
	const home = resolveHome();
	const config = loadConfig(home);
	// outline reads raw archives, never the cache, so it takes no retrieval lock.
	const unit = resolveShowUnit(await readArchiveCatalog(config), options.value);
	let read: OutlineReadResult;
	try {
		read = await readOutlineUnit(unit, options.range);
	} catch (error) {
		if (!(error instanceof TurnRangeError)) throw error;
		// DRAFT copy
		process.stderr.write(`packbat outline: ${error.message}\n\n${USAGE}`);
		return 1;
	}
	if (options.json) process.stdout.write(`${JSON.stringify(read.result)}\n`);
	else printOutline(read);
	return 0;
}
