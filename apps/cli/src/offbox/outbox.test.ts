import { describe, expect, test } from "vitest";
import { parseUploadedRecords } from "./outbox.js";

describe("uploaded state", () => {
	test("keeps the newest valid record per path", () => {
		const records = parseUploadedRecords(
			[
				JSON.stringify({
					v: 1,
					path: "machine/codex/session.zst",
					mtimeMs: 100,
					uploadedAt: "first",
					recipient: "age1first",
					destination: "first:archive",
					rcloneConfig: "default",
				}),
				"not-json",
				JSON.stringify({
					v: 1,
					path: "machine/pi/session.zst",
					mtimeMs: 200,
					uploadedAt: "only",
					recipient: "age1only",
					destination: "only:archive",
					rcloneConfig: "managed",
				}),
				JSON.stringify({
					v: 1,
					path: "machine/codex/session.zst",
					mtimeMs: 300,
					uploadedAt: "newest",
					recipient: "age1newest",
					destination: "newest:archive",
					rcloneConfig: "default",
				}),
				JSON.stringify({
					v: 2,
					path: "ignored",
					mtimeMs: 400,
					uploadedAt: "invalid-version",
					recipient: "age1ignored",
					destination: "ignored:archive",
					rcloneConfig: "default",
				}),
			].join("\n"),
		);

		expect([...records.entries()]).toEqual([
			[
				"machine/codex/session.zst",
				{
					v: 1,
					path: "machine/codex/session.zst",
					mtimeMs: 300,
					uploadedAt: "newest",
					recipient: "age1newest",
					destination: "newest:archive",
					rcloneConfig: "default",
				},
			],
			[
				"machine/pi/session.zst",
				{
					v: 1,
					path: "machine/pi/session.zst",
					mtimeMs: 200,
					uploadedAt: "only",
					recipient: "age1only",
					destination: "only:archive",
					rcloneConfig: "managed",
				},
			],
		]);
	});
});
