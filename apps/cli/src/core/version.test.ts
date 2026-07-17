import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { packbatVersion } from "./version.js";

test("packbatVersion matches the package manifest", () => {
	const manifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
		version: string;
	};
	expect(packbatVersion()).toBe(manifest.version);
});
