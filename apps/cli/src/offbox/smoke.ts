import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BlotterConfig, RemoteConfig } from "../core/config.js";
import { BlotterError } from "../core/errors.js";
import { decryptWithIdentity } from "./age.js";
import { createArchiveRemote } from "./remote.js";

export async function smokeTestRemoteIndex(
	config: BlotterConfig,
	remoteConfig: RemoteConfig,
	identity: string,
): Promise<void> {
	const remote = createArchiveRemote(remoteConfig);
	if (!(await remote.indexExists(config.machine))) {
		// DRAFT copy
		throw new BlotterError("remote index does not exist");
	}

	const stagePath = await mkdtemp(join(tmpdir(), "blotter-offbox-smoke-"));
	try {
		const encryptedIndexPath = join(stagePath, "index.jsonl.age");
		await remote.getIndex(config.machine, encryptedIndexPath);
		const [localIndex, ciphertext] = await Promise.all([
			readFile(join(config.archiveRoot, config.machine, "index.jsonl")),
			readFile(encryptedIndexPath),
		]);
		const remoteIndexContents = await decryptWithIdentity(identity, ciphertext);
		if (!remoteIndexContents.equals(localIndex)) {
			throw new BlotterError("downloaded remote index does not match the local index");
		}
	} finally {
		await rm(stagePath, { recursive: true, force: true });
	}
}
