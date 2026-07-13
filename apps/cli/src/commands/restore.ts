import { loadConfig } from "../core/config.js";
import { resolveHome } from "../core/home.js";
import { readArchivedUnits, resolveArchivedUnit, restoreArchivedUnit } from "../core/restore.js";

const USAGE = "Usage: blotter restore [--machine <name>] [--force] [<id-or-prefix>]\n";
const MACHINE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

interface RestoreOptions {
	machine?: string;
	force: boolean;
	prefix?: string;
}

function usageError(message: string): null {
	process.stderr.write(`blotter restore: ${message}\n\n${USAGE}`);
	return null;
}

function parseOptions(argv: string[]): RestoreOptions | null {
	const options: RestoreOptions = { force: false };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		switch (argument) {
			case "--machine": {
				if (options.machine !== undefined) {
					return usageError("--machine may only be passed once");
				}
				const value = argv[index + 1];
				if (value === undefined || value.startsWith("--")) {
					return usageError("--machine requires a name");
				}
				if (!MACHINE_PATTERN.test(value)) {
					return usageError("--machine must be lowercase and hostname-safe (a-z, 0-9, -)");
				}
				options.machine = value;
				index += 1;
				break;
			}
			case "--force":
				if (options.force) {
					return usageError("--force may only be passed once");
				}
				options.force = true;
				break;
			default:
				if (argument === undefined) {
					return usageError("missing argument");
				}
				if (argument.startsWith("-")) {
					return usageError(`unknown option ${argument}`);
				}
				if (options.prefix !== undefined) {
					return usageError("only one id or prefix may be passed");
				}
				options.prefix = argument;
		}
	}
	if (options.force && options.prefix === undefined) {
		return usageError("--force requires an id or prefix");
	}
	return options;
}

function printUnits(machine: string, units: Awaited<ReturnType<typeof readArchivedUnits>>): void {
	if (units.length === 0) {
		process.stdout.write(`no archived sessions for ${machine}\n`);
		return;
	}
	for (const unit of units) {
		const fileCount = `${unit.files.length} file${unit.files.length === 1 ? "" : "s"}`;
		const archived = unit.archived ? " · archived" : "";
		process.stdout.write(
			`${unit.id} · ${unit.harness} · ${unit.machine} · ${fileCount} · ${new Date(unit.newestSourceMtimeMs).toISOString()}${archived}\n`,
		);
	}
}

export async function runRestore(argv: string[]): Promise<number> {
	const options = parseOptions(argv);
	if (options === null) {
		return 1;
	}
	const config = loadConfig(resolveHome());
	const machine = options.machine ?? config.machine;
	const units = await readArchivedUnits(config, machine);
	if (options.prefix === undefined) {
		printUnits(machine, units);
		return 0;
	}
	const unit = resolveArchivedUnit(units, options.prefix);
	const result = await restoreArchivedUnit(unit, options.force);
	for (const location of unit.supersededLocations) {
		process.stdout.write(`superseded codex location: ${location}\n`);
	}
	process.stdout.write(
		`restored ${result.fileCount} file${result.fileCount === 1 ? "" : "s"} to ${result.targetRoot}\n`,
	);
	for (const hint of result.resumeHints) {
		process.stdout.write(`${hint}\n`);
	}
	return 0;
}
