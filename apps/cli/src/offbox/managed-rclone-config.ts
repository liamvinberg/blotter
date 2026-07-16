import { chmod, mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PackbatError } from "../core/errors.js";
import { writePrivateFile } from "../core/private-file.js";

export interface ManagedRcloneSection {
	name: string;
	type: string;
	fields: ReadonlyMap<string, string>;
}

function parseSections(contents: string): Map<string, Map<string, string>> {
	const sections = new Map<string, Map<string, string>>();
	let current: Map<string, string> | undefined;
	for (const rawLine of contents.split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
		if (line.startsWith("[") && line.endsWith("]")) {
			const name = line.slice(1, -1).trim();
			if (name === "" || sections.has(name)) {
				throw new PackbatError("managed rclone config has an invalid or duplicate section");
			}
			current = new Map<string, string>();
			sections.set(name, current);
			continue;
		}
		const separator = line.indexOf("=");
		if (current === undefined || separator <= 0) {
			throw new PackbatError("managed rclone config contains an invalid line");
		}
		const key = line.slice(0, separator).trim();
		const value = line.slice(separator + 1).trim();
		if (key === "" || current.has(key)) {
			throw new PackbatError("managed rclone config contains an invalid or duplicate field");
		}
		current.set(key, value);
	}
	return sections;
}

export function remoteNameFromDestination(destination: string): string | null {
	const separator = destination.indexOf(":");
	return separator <= 0 ? null : destination.slice(0, separator);
}

function validateMeaningfulSection(name: string, fields: Map<string, string>): ManagedRcloneSection {
	const type = fields.get("type");
	if (type === undefined || !/^[a-z0-9][a-z0-9_-]*$/u.test(type)) {
		throw new PackbatError(`managed rclone remote [${name}] needs a valid type`);
	}
	const requiredByType: Readonly<Record<string, readonly string[]>> = {
		alias: ["remote"],
		drive: ["token"],
		dropbox: ["token"],
		sftp: ["host"],
	};
	const required = requiredByType[type];
	if (required !== undefined) {
		const missing = required.filter(
			(field) => fields.get(field)?.trim() === undefined || fields.get(field)?.trim() === "",
		);
		if (missing.length > 0) {
			throw new PackbatError(`managed rclone remote [${name}] is missing ${missing.join(", ")}`);
		}
	}
	if (type !== "local" && ![...fields].some(([key, value]) => key !== "type" && value.trim() !== "")) {
		throw new PackbatError(`managed rclone remote [${name}] has no usable settings`);
	}
	return { name, type, fields };
}

export function inspectManagedRcloneRemote(contents: string, destination: string): ManagedRcloneSection {
	const name = remoteNameFromDestination(destination);
	if (name === null) {
		throw new PackbatError("managed rclone destination must name a configured remote");
	}
	const fields = parseSections(contents).get(name);
	if (fields === undefined) {
		throw new PackbatError(`managed rclone config does not contain [${name}]`);
	}
	return validateMeaningfulSection(name, fields);
}

export async function ensurePrivateManagedRcloneConfig(path: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const handle = await open(path, "a", 0o600);
	await handle.close();
	await chmod(path, 0o600);
}

export async function writeManagedRcloneConfig(path: string, contents: string): Promise<void> {
	await writePrivateFile(path, contents);
}

export async function installManagedRcloneConfig(options: {
	sourcePath: string;
	destinationPath: string;
	remoteDestination: string;
}): Promise<void> {
	let contents: string;
	try {
		contents = await readFile(options.sourcePath, "utf8");
	} catch {
		throw new PackbatError("managed rclone config source must be a readable file");
	}
	inspectManagedRcloneRemote(contents, options.remoteDestination);
	await writeManagedRcloneConfig(options.destinationPath, contents);
}

export async function readManagedRcloneRemote(path: string, destination: string): Promise<ManagedRcloneSection | null> {
	let contents: string;
	try {
		contents = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	return inspectManagedRcloneRemote(contents, destination);
}
