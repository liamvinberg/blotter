import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { BlotterConfig } from "../core/config.js";
import { BlotterError, errorMessage } from "../core/errors.js";
import {
	type ArchivedUnit,
	type RestoreResult,
	readArchivedUnits,
	resolveArchivedUnit,
	restoreArchivedUnit,
} from "../core/restore.js";
import { decryptWithIdentity, identityToRecipient, parseIdentityFile } from "./age.js";
import { copyFile, joinRcloneDestination, type RcloneConfigMode } from "./rclone.js";

export type RemoteRestoreResult =
	| { kind: "listed"; units: ArchivedUnit[] }
	| { kind: "restored"; unit: ArchivedUnit; restore: RestoreResult };

async function readIdentity(path: string): Promise<string> {
	try {
		return parseIdentityFile(await readFile(path, "utf8"));
	} catch (error) {
		if (error instanceof BlotterError) {
			throw error;
		}
		throw new BlotterError(`could not read identity file ${path}: ${errorMessage(error)}`);
	}
}

async function pullAndDecryptFile(options: {
	remotePath: string;
	encryptedPath: string;
	decryptedPath: string;
	mode: RcloneConfigMode;
	identity: string;
	label: string;
}): Promise<void> {
	await mkdir(dirname(options.encryptedPath), { recursive: true });
	await copyFile(options.remotePath, options.encryptedPath, options.mode);
	try {
		await writeFile(
			options.decryptedPath,
			await decryptWithIdentity(options.identity, await readFile(options.encryptedPath)),
		);
	} catch (error) {
		throw new BlotterError(`could not decrypt ${options.label}: ${errorMessage(error)}`);
	}
}

export async function restoreFromRemote(options: {
	config: BlotterConfig;
	machine: string;
	identityPath: string;
	prefix: string | undefined;
	force: boolean;
}): Promise<RemoteRestoreResult> {
	if (options.config.offbox.mode !== "configured") {
		throw new BlotterError("off-box is not configured; run `blotter init` first");
	}
	const identity = await readIdentity(options.identityPath);
	let recipient: string;
	try {
		recipient = await identityToRecipient(identity);
	} catch (error) {
		throw new BlotterError(`could not parse age identity: ${errorMessage(error)}`);
	}
	if (recipient !== options.config.offbox.recipient) {
		throw new BlotterError("identity does not match the configured age recipient");
	}

	const stagePath = await mkdtemp(join(tmpdir(), "blotter-remote-restore-"));
	try {
		const machinePath = join(stagePath, options.machine);
		const encryptedIndexPath = join(stagePath, "index.jsonl.age");
		await mkdir(machinePath, { recursive: true });
		await pullAndDecryptFile({
			remotePath: joinRcloneDestination(options.config.offbox.remote.destination, `${options.machine}/index.jsonl.age`),
			encryptedPath: encryptedIndexPath,
			decryptedPath: join(machinePath, "index.jsonl"),
			mode: options.config.offbox.remote.rcloneConfig,
			identity,
			label: "remote index",
		});
		const stageConfig: BlotterConfig = { ...options.config, archiveRoot: stagePath };
		const units = await readArchivedUnits(stageConfig, options.machine);
		if (options.prefix === undefined) {
			return { kind: "listed", units };
		}

		const unit = resolveArchivedUnit(units, options.prefix);
		for (const file of unit.files) {
			const encryptedPath = `${file.archivePath}.age`;
			await pullAndDecryptFile({
				remotePath: joinRcloneDestination(
					options.config.offbox.remote.destination,
					`${options.machine}/${file.record.path}.age`,
				),
				encryptedPath,
				decryptedPath: file.archivePath,
				mode: options.config.offbox.remote.rcloneConfig,
				identity,
				label: `remote file ${file.record.path}`,
			});
		}
		return { kind: "restored", unit, restore: await restoreArchivedUnit(unit, options.force) };
	} finally {
		await rm(stagePath, { recursive: true, force: true });
	}
}
