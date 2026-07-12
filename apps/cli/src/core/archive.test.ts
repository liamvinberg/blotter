import { describe, expect, test } from "vitest";
import { shouldArchive } from "./archive.js";

describe("shouldArchive", () => {
	test("archives a missing target", () => {
		expect(shouldArchive({ sourceMtimeMs: 100, sourceSize: 10, stored: null, indexSourceSize: undefined })).toBe(true);
	});

	test("archives a source newer than the stored file", () => {
		expect(shouldArchive({ sourceMtimeMs: 101, sourceSize: 10, stored: { mtimeMs: 100 }, indexSourceSize: 10 })).toBe(
			true,
		);
	});

	test("uses indexed source size only as an equal-mtime tiebreak", () => {
		expect(shouldArchive({ sourceMtimeMs: 100, sourceSize: 11, stored: { mtimeMs: 100 }, indexSourceSize: 10 })).toBe(
			true,
		);
		expect(
			shouldArchive({ sourceMtimeMs: 100, sourceSize: 11, stored: { mtimeMs: 100 }, indexSourceSize: undefined }),
		).toBe(false);
	});

	test("skips equal and older sources", () => {
		expect(shouldArchive({ sourceMtimeMs: 100, sourceSize: 10, stored: { mtimeMs: 100 }, indexSourceSize: 10 })).toBe(
			false,
		);
		expect(shouldArchive({ sourceMtimeMs: 99, sourceSize: 11, stored: { mtimeMs: 100 }, indexSourceSize: 10 })).toBe(
			false,
		);
	});
});
