import { accessSync, constants } from "node:fs";
import { describe, expect, test } from "vitest";
import {
	classifyRcloneOAuthFailure,
	discoverRclone,
	joinRcloneDestination,
	parseRcloneProgressLine,
} from "./rclone.js";

const wellKnownRclone = ["/opt/homebrew/bin/rclone", "/usr/local/bin/rclone", "/usr/bin/rclone"].find((path) => {
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
});

describe("rclone destinations", () => {
	test("joins local paths and remote roots without changing their meaning", () => {
		expect(joinRcloneDestination("/tmp/remote", "machine/index.jsonl.age")).toBe("/tmp/remote/machine/index.jsonl.age");
		expect(joinRcloneDestination("/", "/machine/index.jsonl.age")).toBe("/machine/index.jsonl.age");
		expect(joinRcloneDestination("backup:", "machine/index.jsonl.age")).toBe("backup:machine/index.jsonl.age");
		expect(joinRcloneDestination("backup:bucket/root/", "machine/index.jsonl.age")).toBe(
			"backup:bucket/root/machine/index.jsonl.age",
		);
	});

	test("classifies OAuth grant expiry separately from client repair", () => {
		expect(classifyRcloneOAuthFailure("oauth2: cannot fetch token: 400 invalid_grant")).toEqual({
			kind: "grant",
			errorClass: "invalid_grant",
		});
		expect(classifyRcloneOAuthFailure("oauth2: unauthorized_client")).toEqual({
			kind: "client",
			errorClass: "unauthorized_client",
		});
		expect(classifyRcloneOAuthFailure("network timeout")).toBeNull();
	});

	test.skipIf(wellKnownRclone === undefined)("finds rclone in a well-known location after PATH search", async () => {
		expect(await discoverRclone({ PATH: "/usr/bin" })).toBe(wellKnownRclone);
	});
});

describe("rclone progress", () => {
	test("parses a completed object", () => {
		expect(
			parseRcloneProgressLine(
				'{"level":"info","msg":"Copied (new)","object":"machine-a/claude/projects/session.jsonl.age"}',
			),
		).toEqual({ object: "machine-a/claude/projects/session.jsonl.age" });
	});

	test("parses cumulative uploaded bytes", () => {
		expect(parseRcloneProgressLine('{"level":"notice","msg":"","stats":{"bytes":43210}}')).toEqual({
			bytes: 43_210,
		});
	});

	test("ignores non-JSON noise", () => {
		expect(parseRcloneProgressLine("rclone wrote an ordinary diagnostic")).toBeNull();
	});
});
