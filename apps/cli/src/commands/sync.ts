import { sweep } from "../core/archive.js";
import { assertZstdSupport } from "../core/compress.js";
import { loadConfig } from "../core/config.js";
import { resolveHome } from "../core/home.js";
import { withSyncLock } from "../core/lock.js";
import { appendLog } from "../core/log.js";
import { writeRunStamps } from "../core/stamps.js";

export async function runSync(_argv: string[]): Promise<number> {
	const home = resolveHome();
	const config = loadConfig(home);
	assertZstdSupport();
	const locked = await withSyncLock(home.statePath, async () => {
		const startedAt = new Date().toISOString();
		let archived = 0;
		let unchanged = 0;
		let failed = 0;
		let errors: string[] = [];
		try {
			const result = await sweep(config, process.env);
			archived = result.archived;
			unchanged = result.unchanged;
			failed = result.failed;
			errors = result.errors;
		} catch (error) {
			failed = 1;
			errors = [`sweep: ${error instanceof Error ? error.message : String(error)}`];
		}
		const finishedAt = new Date().toISOString();
		const ok = failed === 0;
		const summary = `archived ${archived}, unchanged ${unchanged}, failed ${failed}`;
		await writeRunStamps(home.statePath, {
			startedAt,
			finishedAt,
			ok,
			archived,
			unchanged,
			failed,
		});
		await appendLog(home.logsPath, summary, new Date(finishedAt));
		for (const error of errors) {
			process.stderr.write(`blotter sync: ${error}\n`);
		}
		process.stdout.write(`${summary}\n`);
		return ok ? 0 : 1;
	});
	if (!locked.acquired) {
		process.stdout.write("sync already running\n");
		return 0;
	}
	return locked.value;
}
