import { describe, expect, test } from "vitest";
import { isVersionBehind, versionFact } from "./latest-version.js";

describe("isVersionBehind", () => {
	test.each([
		["1.2.3", "2.0.0"],
		["1.2.3", "1.3.0"],
		["1.2.3", "1.2.4"],
		["1.2.3-prerelease.1", "1.2.4"],
		["1.malformed.3", "1.1.0"],
	])("reports %s behind %s", (current, latest) => {
		expect(isVersionBehind(current, latest)).toBe(true);
	});

	test.each([
		["1.2.3", "1.2.3"],
		["2.0.0", "1.9.9"],
		["1.3.0", "1.2.9"],
		["1.2.4", "1.2.3"],
		["1.2.3-prerelease.1", "1.2.3"],
		["1.0.0", "1.malformed.0"],
	])("does not report %s behind %s", (current, latest) => {
		expect(isVersionBehind(current, latest)).toBe(false);
	});
});

describe("versionFact", () => {
	test("reports a failed lookup as information", () => {
		expect(versionFact("1.2.3", null)).toEqual({
			id: "version",
			title: "version",
			status: "info",
			detail: "1.2.3, could not check the latest version",
		});
	});

	test("reports an available update as information", () => {
		expect(versionFact("1.2.3", "2.0.0")).toEqual({
			id: "version",
			title: "version",
			status: "info",
			detail: "1.2.3, latest is 2.0.0, update with npm install --global packbat@latest",
		});
	});

	test("reports the current version as healthy", () => {
		expect(versionFact("1.2.3", "1.2.3")).toEqual({
			id: "version",
			title: "version",
			status: "ok",
			detail: "1.2.3 is the latest",
		});
	});
});
