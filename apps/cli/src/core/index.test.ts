import { describe, expect, test } from "vitest";
import { parseIndex } from "./index.js";

const baseRecord = {
	v: 1,
	path: "claude-code/project/session.jsonl.zst",
	harness: "claude-code",
	machine: "test-machine",
	unit: "11111111-1111-4111-8111-111111111111",
	role: "main",
	source: "/source/project/session.jsonl",
	sourceMtimeMs: 100,
	sourceSize: 10,
	storedSize: 20,
	sha256: "a".repeat(64),
	archivedAt: "2026-01-02T03:04:05.000Z",
} as const;

describe("parseIndex", () => {
	test("keeps the newest valid record per archive path and counts corrupt lines", () => {
		const newest = { ...baseRecord, sourceMtimeMs: 200, sourceSize: 30, archivedAt: "2026-01-03T03:04:05.000Z" };
		const contents = [
			JSON.stringify(baseRecord),
			"{not-json",
			JSON.stringify(newest),
			JSON.stringify({ v: 2 }),
			"",
		].join("\n");

		const result = parseIndex(contents);

		expect(result.corruptLines).toBe(2);
		expect([...result.records.values()]).toEqual([newest]);
	});
});
