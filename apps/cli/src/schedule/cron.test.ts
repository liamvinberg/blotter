import { describe, expect, test } from "vitest";
import { generateCronEntry, mergeCronTab, stripCronEntry } from "./cron.js";

describe("cron artifact", () => {
	test("generates the hourly entry and owns only its marked line", () => {
		const entry = generateCronEntry({
			nodePath: "/usr/local/bin/node",
			entryPath: "/home/liam/blotter app/main.js",
			blotterHome: "/home/liam/.blotter",
		});
		expect(entry).toBe(
			"3 * * * * BLOTTER_HOME='/home/liam/.blotter' '/usr/local/bin/node' '/home/liam/blotter app/main.js' 'sync' # blotter-sync",
		);

		const existing = "MAILTO=liam@example.com\n0 4 * * * /usr/local/bin/backup\n3 * * * * old # blotter-sync\n";
		expect(mergeCronTab(existing, entry)).toBe(
			"MAILTO=liam@example.com\n0 4 * * * /usr/local/bin/backup\n3 * * * * BLOTTER_HOME='/home/liam/.blotter' '/usr/local/bin/node' '/home/liam/blotter app/main.js' 'sync' # blotter-sync\n",
		);
		expect(stripCronEntry(mergeCronTab(existing, entry))).toBe(
			"MAILTO=liam@example.com\n0 4 * * * /usr/local/bin/backup\n",
		);
	});

	test("omits the command environment when blotter home is not set", () => {
		expect(generateCronEntry({ nodePath: "/usr/bin/node", entryPath: "/opt/blotter/main.js" })).toBe(
			"3 * * * * '/usr/bin/node' '/opt/blotter/main.js' 'sync' # blotter-sync",
		);
	});
});
