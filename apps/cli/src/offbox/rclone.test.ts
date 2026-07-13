import { describe, expect, test } from "vitest";
import { joinRcloneDestination } from "./rclone.js";

describe("rclone destinations", () => {
	test("joins local paths and remote roots without changing their meaning", () => {
		expect(joinRcloneDestination("/tmp/remote", "machine/index.jsonl.age")).toBe("/tmp/remote/machine/index.jsonl.age");
		expect(joinRcloneDestination("/", "/machine/index.jsonl.age")).toBe("/machine/index.jsonl.age");
		expect(joinRcloneDestination("backup:", "machine/index.jsonl.age")).toBe("backup:machine/index.jsonl.age");
		expect(joinRcloneDestination("backup:bucket/root/", "machine/index.jsonl.age")).toBe(
			"backup:bucket/root/machine/index.jsonl.age",
		);
	});
});
