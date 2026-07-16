import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { loadConfig, type OffboxConfig } from "../core/config.js";
import { resolveHome } from "../core/home.js";
import { writePrivateFile } from "../core/private-file.js";
import {
	createInitScheduleOptions,
	detectInitStores,
	installInitSchedule,
	skippedOffboxConfig,
	userHome,
	writeInitConfig,
} from "../core/setup.js";
import { uninstallSchedule } from "../schedule/scheduler.js";
import { runDoctor } from "./doctor.js";
import { runSync } from "./sync.js";

const USAGE = `Usage: packbat init --yes [--archive-root <abs>] [--offbox skip|remote]
       [--offbox-remote <rclone-dest>] [--age-recipient <age1…>]
       [--rclone-config default|managed] [--managed-rclone-config <abs>] [--no-activate]
       packbat init --uninstall
`;

interface InitOptions {
	yes: boolean;
	uninstall: boolean;
	archiveRoot?: string;
	offbox?: "skip" | "remote";
	offboxRemote?: string;
	ageRecipient?: string;
	rcloneConfig?: "default" | "managed";
	managedRcloneConfig?: string;
	noActivate: boolean;
}

function usageError(message: string): null {
	process.stderr.write(`packbat init: ${message}\n\n${USAGE}`);
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
			case "--managed-rclone-config": {
				if (options.managedRcloneConfig !== undefined) {
					return usageError("--managed-rclone-config may only be passed once");
				}
				const value = argv[index + 1];
				if (value === undefined || !isAbsolute(value)) {
					return usageError("--managed-rclone-config requires an absolute path");
				}
				options.managedRcloneConfig = value;
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
			options.managedRcloneConfig !== undefined ||
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
		options.rcloneConfig !== undefined ||
		options.managedRcloneConfig !== undefined
	) {
		return usageError("off-box remote options require --offbox remote");
	}
	if (options.rcloneConfig === "managed" && options.managedRcloneConfig === undefined) {
		return usageError("--rclone-config managed requires --managed-rclone-config");
	}
	if (options.managedRcloneConfig !== undefined && options.rcloneConfig !== "managed") {
		return usageError("--managed-rclone-config requires --rclone-config managed");
	}
	return options;
}

function requestedOffbox(options: InitOptions): OffboxConfig | undefined {
	if (options.offbox === "skip") {
		return skippedOffboxConfig();
	}
	if (options.offbox === "remote") {
		return {
			mode: "configured",
			recipient: options.ageRecipient!,
			remotes: [
				{
					type: "rclone",
					destination: options.offboxRemote!,
					rcloneConfig: options.rcloneConfig ?? "default",
				},
			],
		};
	}
	return undefined;
}

function managedRemoteSection(destination: string): string | null {
	const separator = destination.indexOf(":");
	return separator <= 0 ? null : destination.slice(0, separator);
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
		if (process.stdin.isTTY === true) {
			const { runInitWizard } = await import("./init-wizard.js");
			return await runInitWizard();
		}
		process.stderr.write("packbat init: stdin is not a TTY; run `packbat init --yes`\n");
		return 1;
	}

	const home = resolveHome();
	if (options.managedRcloneConfig !== undefined) {
		let managedConfig: string;
		try {
			managedConfig = await readFile(options.managedRcloneConfig, "utf8");
		} catch {
			usageError("--managed-rclone-config must point to a readable file");
			return 1;
		}
		const remoteSection = managedRemoteSection(options.offboxRemote!);
		if (managedConfig.trim() === "" || remoteSection === null) {
			usageError("--managed-rclone-config must contain the configured named remote");
			return 1;
		}
		const sections = new Set(
			managedConfig
				.split(/\r?\n/u)
				.map((line) => {
					const trimmed = line.trim();
					return trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : undefined;
				})
				.filter((section): section is string => section !== undefined),
		);
		if (!sections.has(remoteSection)) {
			usageError(`--managed-rclone-config does not contain [${remoteSection}]`);
			return 1;
		}
		await writePrivateFile(home.rcloneConfPath, managedConfig);
	}
	const detection = detectInitStores(homePath);
	const config = await writeInitConfig(
		home,
		options.archiveRoot ?? (existsSync(home.configPath) ? loadConfig(home).archiveRoot : home.defaultArchiveRoot),
		requestedOffbox(options),
	);
	const installed = await installInitSchedule(await createInitScheduleOptions(home, homePath), !options.noActivate);

	process.stdout.write(`detected: ${detection.detected.map(({ displayName }) => displayName).join(", ") || "none"}\n`);
	if (detection.unsupported.length === 0) {
		process.stdout.write("found but not yet supported: none\n");
	} else {
		for (const { displayName, path } of detection.unsupported) {
			process.stdout.write(`found but not yet supported: ${displayName} (${path})\n`);
		}
	}
	process.stdout.write(`archive: ${config.archiveRoot}\n`);
	for (const path of installed.schedule.artifactPaths) {
		process.stdout.write(`wrote: ${path}\n`);
	}
	for (const note of [...installed.schedule.notes, ...installed.activationNotes]) {
		process.stdout.write(`${note}\n`);
	}
	const syncCode = await runSync([]);
	const doctorCode = await runDoctor([]);
	return syncCode === 1 || doctorCode === 1 ? 1 : 0;
}
