import { cloudUpdateAvailableVersion } from "../cloud/api-fetch.js";
import { sweep } from "../core/archive.js";
import { assertZstdSupport } from "../core/compress.js";
import { loadConfig, type PackbatConfig } from "../core/config.js";
import { formatMegabytes } from "../core/format.js";
import { type PackbatHome, resolveHome } from "../core/home.js";
import { lockHolderStartTime, withRetrievalLock, withSyncLock } from "../core/lock.js";
import { appendLog } from "../core/log.js";
import { writeRunStamps } from "../core/stamps.js";
import { type MirrorProgress, mirrorOffbox, type RemoteMirrorOutcome } from "../offbox/mirror.js";
import {
	type OffboxProgress,
	publishOffbox,
	type RemotePublishOutcome,
	remindOffboxSkipped,
} from "../offbox/outbox.js";
import { assertFts5, closeDatabase, openAndRefresh } from "../retrieval/database.js";

const USAGE = "Usage: packbat sync\n";

export interface SyncOutputOptions {
	writeSummary?: boolean;
	onSummary?: (summary: string) => void;
	onBusy?: () => void;
	onOffboxProgress?: (destination: string, progress: OffboxProgress) => void;
	onMirrorProgress?: (destination: string, progress: MirrorProgress) => void;
}

function ttyOffboxProgress(): ((destination: string, progress: OffboxProgress) => void) | undefined {
	if (!process.stderr.isTTY) return undefined;
	let lastDestination: string | undefined;
	let lastPaintedAt = 0;
	let lastProgress: OffboxProgress | undefined;
	return (destination, progress) => {
		const first = destination !== lastDestination;
		const last = progress.done === progress.total;
		if (
			lastProgress !== undefined &&
			destination === lastDestination &&
			progress.done === lastProgress.done &&
			progress.total === lastProgress.total &&
			progress.bytes === lastProgress.bytes &&
			progress.totalBytes === lastProgress.totalBytes
		) {
			return;
		}
		const now = Date.now();
		if (!first && !last && now - lastPaintedAt < 250) return;
		lastDestination = destination;
		lastPaintedAt = now;
		lastProgress = progress;
		process.stderr.write(
			`\rpackbat sync: off-box ${destination}: ${progress.done}/${progress.total}, ${formatMegabytes(progress.bytes)} of ${formatMegabytes(progress.totalBytes)} MB uploaded`, // DRAFT copy
		);
		if (last) process.stderr.write("\n");
	};
}

function ttyMirrorProgress(): ((destination: string, progress: MirrorProgress) => void) | undefined {
	if (!process.stderr.isTTY) return undefined;
	let lastKey: string | undefined;
	let lastPaintedAt = 0;
	let lastProgress: MirrorProgress | undefined;
	return (destination, progress) => {
		const key = `${destination}\0${progress.machine}`;
		const first = key !== lastKey;
		const last = progress.done === progress.total;
		if (
			lastProgress !== undefined &&
			key === lastKey &&
			progress.done === lastProgress.done &&
			progress.total === lastProgress.total
		) {
			return;
		}
		const now = Date.now();
		if (!first && !last && now - lastPaintedAt < 250) return;
		lastKey = key;
		lastPaintedAt = now;
		lastProgress = progress;
		process.stderr.write(
			`\rpackbat sync: mirror ${destination} ${progress.machine}: ${progress.done}/${progress.total} pulled`, // DRAFT copy
		);
		if (last) process.stderr.write("\n");
	};
}

function reportSummary(summary: string, options: SyncOutputOptions): void {
	options.onSummary?.(summary);
	if (options.writeSummary !== false) {
		process.stdout.write(`${summary}\n`);
	}
}

function reportCloudUpdate(): void {
	const version = cloudUpdateAvailableVersion();
	if (version !== null) {
		process.stdout.write(`packbat ${version} is available, update with npm install --global packbat@latest\n`); // DRAFT copy
	}
}

function offboxSummary(outcomes: RemotePublishOutcome[]): string {
	return `off-box ${outcomes.filter((outcome) => outcome.ok).length}/${outcomes.length}`; // DRAFT copy
}

async function refreshRetrievalIndex(home: PackbatHome, config: PackbatConfig): Promise<void> {
	try {
		assertFts5();
	} catch {
		return;
	}
	try {
		await withRetrievalLock(home.statePath, async () => {
			const database = await openAndRefresh(home, config);
			closeDatabase(database);
		});
	} catch (error) {
		const detail = (error instanceof Error ? error.message : String(error)).replaceAll(/\r?\n/g, " ");
		try {
			await appendLog(home.logsPath, `retrieval refresh failed: ${detail}`); // DRAFT copy
		} catch {
			// Retrieval refresh and its diagnostics are both best-effort.
		}
	}
}

export async function runSync(argv: string[], output: SyncOutputOptions = {}): Promise<number> {
	if (argv.length > 0) {
		process.stderr.write(USAGE);
		return 1;
	}
	const home = resolveHome();
	const config = loadConfig(home);
	assertZstdSupport();
	const locked = await withSyncLock(home.statePath, async () => {
		const startedAt = new Date().toISOString();
		let archived = 0;
		let unchanged = 0;
		let failed = 0;
		let repaired = 0;
		let errors: string[] = [];
		let offboxOutcomes: RemotePublishOutcome[] = [];
		let mirrorOutcomes: RemoteMirrorOutcome[] = [];
		let mirrored = 0;
		let offboxError: string | undefined;
		let mirrorError: string | undefined;
		try {
			const result = await sweep(config, process.env);
			archived = result.archived;
			unchanged = result.unchanged;
			failed = result.failed;
			repaired = result.repaired;
			errors = result.errors;
		} catch (error) {
			failed = 1;
			errors = [`sweep: ${error instanceof Error ? error.message : String(error)}`];
		}
		const ok = failed === 0;
		if (ok) {
			try {
				if (config.offbox.mode === "configured") {
					offboxOutcomes = await publishOffbox(
						home,
						config,
						config.offbox,
						output.onOffboxProgress ?? ttyOffboxProgress(),
					);
					try {
						const mirror = await mirrorOffbox(
							home,
							config,
							config.offbox,
							output.onMirrorProgress ?? ttyMirrorProgress(),
						);
						mirrorOutcomes = mirror.outcomes;
						mirrored = mirror.pulled;
					} catch (error) {
						mirrorError = error instanceof Error ? error.message : String(error);
					}
				} else {
					await remindOffboxSkipped(home);
				}
			} catch (error) {
				offboxError = error instanceof Error ? error.message : String(error);
			}
		}
		await refreshRetrievalIndex(home, config);
		const offboxFailures = offboxOutcomes.filter(
			(outcome): outcome is RemotePublishOutcome & { error: string } => !outcome.ok && outcome.error !== undefined,
		);
		const mirrorFailures = mirrorOutcomes.filter(
			(outcome): outcome is RemoteMirrorOutcome & { error: string } => !outcome.ok && outcome.error !== undefined,
		);
		const finishedAt = new Date().toISOString();
		const summary = `archived ${archived}, unchanged ${unchanged}, failed ${failed}${repaired > 0 ? `, repaired ${repaired}` : ""}${offboxOutcomes.length > 0 ? `, ${offboxSummary(offboxOutcomes)}` : ""}${mirrored > 0 ? `, mirrored ${mirrored}` : ""}`; // DRAFT copy
		const offboxFailureDetails = [
			...offboxFailures.map((outcome) => `${outcome.destination}: ${outcome.error}`),
			...mirrorFailures.map((outcome) => `${outcome.destination}: ${outcome.error}`),
			...(offboxError === undefined ? [] : [offboxError]),
			...(mirrorError === undefined ? [] : [`mirror: ${mirrorError}`]),
		];
		await writeRunStamps(home.statePath, {
			startedAt,
			finishedAt,
			ok,
			archived,
			unchanged,
			failed,
			repaired,
			...(offboxFailureDetails.length === 0 ? {} : { offbox: offboxFailureDetails.join("; ") }),
		});
		await appendLog(home.logsPath, summary, new Date(finishedAt));
		if (offboxError !== undefined) {
			await appendLog(home.logsPath, `off-box failed: ${offboxError}`, new Date(finishedAt));
		}
		for (const outcome of offboxFailures) {
			await appendLog(home.logsPath, `off-box failed (${outcome.destination}): ${outcome.error}`, new Date(finishedAt)); // DRAFT copy
		}
		if (mirrorError !== undefined) {
			await appendLog(home.logsPath, `off-box failed: mirror: ${mirrorError}`, new Date(finishedAt)); // DRAFT copy
		}
		for (const outcome of mirrorFailures) {
			await appendLog(home.logsPath, `off-box failed (${outcome.destination}): ${outcome.error}`, new Date(finishedAt)); // DRAFT copy
		}
		for (const error of errors) {
			process.stderr.write(`packbat sync: ${error}\n`);
		}
		if (offboxError !== undefined) {
			process.stderr.write(`packbat sync: off-box: ${offboxError}\n`);
		}
		for (const outcome of offboxFailures) {
			process.stderr.write(`packbat sync: off-box ${outcome.destination}: ${outcome.error}\n`); // DRAFT copy
		}
		if (mirrorError !== undefined) {
			process.stderr.write(`packbat sync: off-box: mirror: ${mirrorError}\n`); // DRAFT copy
		}
		for (const outcome of mirrorFailures) {
			process.stderr.write(`packbat sync: off-box ${outcome.destination}: ${outcome.error}\n`); // DRAFT copy
		}
		reportSummary(summary, output);
		reportCloudUpdate();
		return ok && offboxFailures.length === 0 && offboxError === undefined ? 0 : 1;
	});
	if (!locked.acquired) {
		output.onBusy?.();
		const startedAt = await lockHolderStartTime(home.statePath, "sync");
		// DRAFT copy
		reportSummary(
			startedAt === null ? "sync already running" : `sync already running, started at ${startedAt}`,
			output,
		);
		return 0;
	}
	return locked.value;
}
