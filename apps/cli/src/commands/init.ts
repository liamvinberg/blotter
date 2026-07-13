import { existsSync } from "node:fs";
import { mkdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute } from "node:path";
import { adapters, unsupportedStores } from "../adapters/registry.js";
import { type BlotterConfig, loadConfig, type OffboxConfig, saveConfig } from "../core/config.js";
import { BlotterError } from "../core/errors.js";
import { resolveHome } from "../core/home.js";
import { defaultMachineName } from "../core/machine.js";
import {
	activateSchedule,
	deactivateSchedule,
	installSchedule,
	scheduleWasActivated,
	uninstallSchedule,
} from "../schedule/scheduler.js";
import { runSync } from "./sync.js";

const USAGE = `Usage: blotter init --yes [--archive-root <abs>] [--offbox skip|remote]
       [--offbox-remote <rclone-dest>] [--age-recipient <age1…>]
       [--rclone-config default|managed] [--no-activate]
       blotter init --uninstall
`;

interface InitOptions {
	yes: boolean;
	uninstall: boolean;
	archiveRoot?: string;
	offbox?: "skip" | "remote";
	offboxRemote?: string;
	ageRecipient?: string;
	rcloneConfig?: "default" | "managed";
	noActivate: boolean;
}

function usageError(message: string): null {
	process.stderr.write(`blotter init: ${message}\n\n${USAGE}`);
	return null;
}

function parseOptions(argv: string[]): InitOptions | null {
	const options: InitOptions = { yes: false, uninstall: false, noActivate: false };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		switch (argument) {
			case "--yes":
				if (options.yes) {
					return usageError("--yes may only be passed once");
				}
				options.yes = true;
				break;
			case "--archive-root": {
				if (options.archiveRoot !== undefined) {
					return usageError("--archive-root may only be passed once");
				}
				const value = argv[index + 1];
				if (value === undefined || value.startsWith("--")) {
					return usageError("--archive-root requires an absolute path");
				}
				if (!isAbsolute(value)) {
					return usageError("--archive-root requires an absolute path");
				}
				options.archiveRoot = value;
				index += 1;
				break;
			}
			case "--offbox": {
				if (options.offbox !== undefined) {
					return usageError("--offbox may only be passed once");
				}
				const value = argv[index + 1];
				if (value !== "skip" && value !== "remote") {
					return usageError("--offbox only accepts skip or remote");
				}
				options.offbox = value;
				index += 1;
				break;
			}
			case "--offbox-remote": {
				if (options.offboxRemote !== undefined) {
					return usageError("--offbox-remote may only be passed once");
				}
				const value = argv[index + 1];
				if (value === undefined || value.startsWith("--")) {
					return usageError("--offbox-remote requires an rclone destination");
				}
				options.offboxRemote = value;
				index += 1;
				break;
			}
			case "--age-recipient": {
				if (options.ageRecipient !== undefined) {
					return usageError("--age-recipient may only be passed once");
				}
				const value = argv[index + 1];
				if (value === undefined || value.startsWith("--")) {
					return usageError("--age-recipient requires an age1… recipient");
				}
				if (!/^age1[0-9a-z]+$/u.test(value)) {
					return usageError("--age-recipient requires an age1… recipient");
				}
				options.ageRecipient = value;
				index += 1;
				break;
			}
			case "--rclone-config": {
				if (options.rcloneConfig !== undefined) {
					return usageError("--rclone-config may only be passed once");
				}
				const value = argv[index + 1];
				if (value !== "default" && value !== "managed") {
					return usageError("--rclone-config only accepts default or managed");
				}
				options.rcloneConfig = value;
				index += 1;
				break;
			}
			case "--no-activate":
				if (options.noActivate) {
					return usageError("--no-activate may only be passed once");
				}
				options.noActivate = true;
				break;
			case "--uninstall":
				if (options.uninstall) {
					return usageError("--uninstall may only be passed once");
				}
				options.uninstall = true;
				break;
			default:
				return usageError(`unknown option ${argument ?? ""}`);
		}
	}
	if (
		options.uninstall &&
		(options.yes ||
			options.archiveRoot !== undefined ||
			options.offbox !== undefined ||
			options.offboxRemote !== undefined ||
			options.ageRecipient !== undefined ||
			options.rcloneConfig !== undefined ||
			options.noActivate)
	) {
		return usageError("--uninstall cannot be combined with setup options");
	}
	if (options.offbox === "remote") {
		if (options.offboxRemote === undefined) {
			return usageError("--offbox remote requires --offbox-remote");
		}
		if (options.ageRecipient === undefined) {
			return usageError("--offbox remote requires --age-recipient");
		}
	} else if (
		options.offboxRemote !== undefined ||
		options.ageRecipient !== undefined ||
		options.rcloneConfig !== undefined
	) {
		return usageError("off-box remote options require --offbox remote");
	}
	return options;
}

function requestedOffbox(options: InitOptions): OffboxConfig | undefined {
	if (options.offbox === "skip") {
		return { mode: "skipped", skippedAt: new Date().toISOString() };
	}
	if (options.offbox === "remote") {
		return {
			mode: "configured",
			recipient: options.ageRecipient!,
			remote: {
				destination: options.offboxRemote!,
				rcloneConfig: options.rcloneConfig ?? "default",
			},
		};
	}
	return undefined;
}

function userHome(): string {
	const configured = process.env.HOME?.trim();
	return configured ? configured : homedir();
}

export async function runInit(argv: string[]): Promise<number> {
	const options = parseOptions(argv);
	if (options === null) {
		return 1;
	}
	const homePath = userHome();
	if (options.uninstall) {
		const result = await uninstallSchedule({
			userHome: homePath,
			statePath: resolveHome().statePath,
			env: process.env,
		});
		if (result.removedPaths.length === 0) {
			process.stdout.write("schedule: nothing installed\n");
		} else {
			for (const path of result.removedPaths) {
				process.stdout.write(`removed: ${path}\n`);
			}
		}
		return 0;
	}
	if (!options.yes) {
		process.stderr.write("blotter init: interactive setup is coming later; run `blotter init --yes`\n");
		return 1;
	}

	const home = resolveHome();
	const detected = adapters
		.map((adapter) => ({ adapter, path: adapter.storeRoot(process.env, homePath) }))
		.filter(({ path }) => existsSync(path));
	const unsupported = unsupportedStores
		.map((store) => ({ store, path: store.detect(process.env, homePath) }))
		.filter((entry): entry is { store: (typeof unsupportedStores)[number]; path: string } => entry.path !== null);

	let config: BlotterConfig;
	const offbox = requestedOffbox(options);
	if (existsSync(home.configPath)) {
		config = loadConfig(home);
		if (options.archiveRoot !== undefined && options.archiveRoot !== config.archiveRoot) {
			throw new BlotterError(`archive root is already ${config.archiveRoot}; edit config.json to move the archive`);
		}
		if (offbox !== undefined) {
			config = { ...config, offbox };
		}
	} else {
		config = {
			version: 1,
			machine: defaultMachineName(),
			archiveRoot: options.archiveRoot ?? home.defaultArchiveRoot,
			sweep: { intervalMinutes: 60 },
			offbox: offbox ?? { mode: "skipped", skippedAt: new Date().toISOString() },
		};
	}
	saveConfig(home, config);
	await Promise.all([
		mkdir(home.statePath, { recursive: true }),
		mkdir(home.logsPath, { recursive: true }),
		mkdir(config.archiveRoot, { recursive: true }),
	]);

	const entryArgument = process.argv[1];
	if (entryArgument === undefined) {
		throw new Error("CLI entry path is unavailable");
	}
	if (!options.noActivate || scheduleWasActivated(home.statePath)) {
		await deactivateSchedule({ userHome: homePath, statePath: home.statePath, env: process.env });
	}
	const schedule = await installSchedule({
		userHome: homePath,
		statePath: home.statePath,
		logsPath: home.logsPath,
		nodePath: process.execPath,
		entryPath: await realpath(entryArgument),
		...(process.env.BLOTTER_HOME === undefined ? {} : { blotterHome: process.env.BLOTTER_HOME }),
		env: process.env,
	});

	process.stdout.write(`detected: ${detected.map(({ adapter }) => adapter.displayName).join(", ") || "none"}\n`);
	if (unsupported.length === 0) {
		process.stdout.write("found, not yet supported: none\n");
	} else {
		for (const { store, path } of unsupported) {
			process.stdout.write(`found, not yet supported: ${store.displayName} (${path})\n`);
		}
	}
	process.stdout.write(`archive: ${config.archiveRoot}\n`);
	for (const path of schedule.artifactPaths) {
		process.stdout.write(`wrote: ${path}\n`);
	}
	for (const note of schedule.notes) {
		process.stdout.write(`${note}\n`);
	}
	const syncCode = await runSync([]);
	if (!options.noActivate) {
		for (const note of await activateSchedule({ userHome: homePath, statePath: home.statePath, env: process.env })) {
			process.stdout.write(`${note}\n`);
		}
	}
	process.stdout.write("next: blotter doctor\n");
	return syncCode;
}
