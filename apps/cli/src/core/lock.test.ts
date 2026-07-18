import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { readLockHolder } from "./lock.js";

async function makeStatePath(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "packbat-lock-test-"));
}

describe("readLockHolder", () => {
	test("returns the holder recorded in the lock file", async () => {
		const statePath = await makeStatePath();
		await writeFile(join(statePath, "sync.lock"), '{"pid":1234,"startedAt":"2026-07-18T10:18:51.325Z"}\n');
		expect(await readLockHolder(statePath, "sync")).toEqual({ pid: 1234, startedAt: "2026-07-18T10:18:51.325Z" });
	});

	test("returns null when no lock file exists", async () => {
		expect(await readLockHolder(await makeStatePath(), "sync")).toBeNull();
	});

	test.each([
		["not json"],
		["{}"],
		['{"pid":"high","startedAt":42}'],
	])("returns null for lock contents %j", async (contents) => {
		const statePath = await makeStatePath();
		await writeFile(join(statePath, "sync.lock"), contents);
		expect(await readLockHolder(statePath, "sync")).toBeNull();
	});
});
