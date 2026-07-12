import { describe, expect, test } from "vitest";
import { sanitizeMachineName } from "./machine.js";

describe("sanitizeMachineName", () => {
	test.each([
		["Liams-MacBook", "liams-macbook"],
		["  Liam's MacBook  ", "liam-s-macbook"],
		["---work_station---", "work-station"],
		["💻", "machine"],
	])("sanitizes %j to %j", (hostname, expected) => {
		expect(sanitizeMachineName(hostname)).toBe(expected);
	});
});
