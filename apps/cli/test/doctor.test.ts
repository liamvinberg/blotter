import { appendFile, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { appendJsonLine, makeClaudeStore, makeCodexStore, makePiStore } from "./helpers/fixtures.js";
import { makeTempHome, runCli } from "./helpers/run-cli.js";

const homes: string[] = [];

interface JsonFact {
	id: string;
	title: string;
	status: "ok" | "problem" | "info";
	detail: string;
	data?: unknown;
}

interface DoctorJson {
	v: 1;
	ok: boolean;
	machine: string;
	facts: JsonFact[];
}

interface ReconciledData {
	totals: { missing: number; stale: number; pending: number; orphaned: number };
	harnesses: Record<string, { missing: number; stale: number; pending: number; orphaned: number }>;
	indexDrift: { unindexed: number; missingFromTree: number; corruptLines: number };
}

afterEach(async () => {
	await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

async function initializedHome(): Promise<{ home: string; blotterHome: string; archiveRoot: string }> {
	const home = await makeTempHome();
	homes.push(home);
	const blotterHome = join(home, "blotter");
	const archiveRoot = join(home, "archive");
	const result = await runCli(["init", "--yes", "--archive-root", archiveRoot, "--offbox", "skip", "--no-activate"], {
		home,
		env: { BLOTTER_HOME: blotterHome },
	});
	expect(result.code).toBe(0);
	return { home, blotterHome, archiveRoot };
}

describe("blotter doctor", () => {
	test("reports the four independent facts and environment checks as versioned JSON", async () => {
		const layout = await initializedHome();

		const result = await runCli(["doctor", "--json"], {
			home: layout.home,
			env: { BLOTTER_HOME: layout.blotterHome },
		});

		const report = JSON.parse(result.stdout) as DoctorJson;
		expect(report).toMatchObject({ v: 1, machine: expect.any(String), ok: result.code === 0 });
		expect(report.facts.slice(0, 4).map(({ id }) => id)).toEqual(["installed", "live", "fresh", "reconciled"]);
		expect(report.facts.find(({ id }) => id === "installed")).toMatchObject({
			title: "installed",
			status: "ok",
		});
		expect(report.facts.find(({ id }) => id === "live")).toMatchObject({
			title: "live",
			status: expect.stringMatching(/^(ok|problem|info)$/),
			detail: expect.any(String),
		});
		expect(report.facts.find(({ id }) => id === "fresh")).toMatchObject({ status: "ok" });
		expect(report.facts.find(({ id }) => id === "reconciled")).toMatchObject({
			status: "ok",
			detail: expect.stringContaining("nothing missed"),
		});
		expect(report.facts.find(({ id }) => id === "archive-writable")).toMatchObject({ status: "ok" });
		expect(report.facts.find(({ id }) => id === "disk-headroom")).toMatchObject({
			status: expect.stringMatching(/^(ok|problem)$/),
			data: { freeBytes: expect.any(Number) },
		});
		expect(report.facts.find(({ id }) => id === "compression")).toMatchObject({ status: "ok" });
		expect(report.facts.find(({ id }) => id === "offbox")).toMatchObject({
			status: "info",
			detail: expect.stringContaining("skipped"),
		});
		expect(await readFile(join(layout.blotterHome, "config.json"), "utf8")).toContain('"version": 1');
		expect([0, 2]).toContain(result.code);
		expect(result.stderr).toBe("");
	});

	test.skipIf(process.platform !== "darwin")("rejects a tampered launchd artifact and prints its remedy", async () => {
		const layout = await initializedHome();
		const plistPath = join(layout.home, "Library", "LaunchAgents", "com.blotter.sync.plist");
		await appendFile(plistPath, "<!-- tampered -->\n");

		const result = await runCli(["doctor"], {
			home: layout.home,
			env: { BLOTTER_HOME: layout.blotterHome },
		});

		expect(result.code).toBe(2);
		expect(result.stdout).toContain("✗ installed: launchd artifact does not match");
		expect(result.stdout).toContain("problems:");
		expect(result.stdout).toContain("installed: re-run `blotter init`");
		expect(result.stderr).toBe("");
	});

	test.skipIf(process.platform !== "darwin")("reports a missing launchd artifact", async () => {
		const layout = await initializedHome();
		await rm(join(layout.home, "Library", "LaunchAgents", "com.blotter.sync.plist"));

		const result = await runCli(["doctor", "--json"], {
			home: layout.home,
			env: { BLOTTER_HOME: layout.blotterHome },
		});

		const report = JSON.parse(result.stdout) as DoctorJson;
		expect(result.code).toBe(2);
		expect(report.facts.find(({ id }) => id === "installed")).toMatchObject({
			status: "problem",
			detail: expect.stringContaining("missing"),
		});
	});

	test.skipIf(process.platform !== "darwin")("catches a dead node path embedded in the schedule", async () => {
		const layout = await initializedHome();
		const plistPath = join(layout.home, "Library", "LaunchAgents", "com.blotter.sync.plist");
		const plist = await readFile(plistPath, "utf8");
		await writeFile(plistPath, plist.replace(process.execPath, "/synthetic/missing-node"));

		const result = await runCli(["doctor", "--json"], {
			home: layout.home,
			env: { BLOTTER_HOME: layout.blotterHome },
		});

		const report = JSON.parse(result.stdout) as DoctorJson;
		expect(result.code).toBe(2);
		expect(report.facts.find(({ id }) => id === "installed")).toMatchObject({
			status: "problem",
			detail: "scheduled path missing: /synthetic/missing-node",
		});
	});

	test("distinguishes a stale success from a fresh failing run", async () => {
		const layout = await initializedHome();
		const now = Date.now();
		const stamp = (finishedAt: string, ok: boolean) => ({
			startedAt: finishedAt,
			finishedAt,
			ok,
			archived: 0,
			unchanged: 0,
			failed: ok ? 0 : 1,
		});
		await writeFile(
			join(layout.blotterHome, "state", "last-success.json"),
			`${JSON.stringify(stamp(new Date(now - 3 * 60 * 60 * 1000).toISOString(), true))}\n`,
		);
		await writeFile(
			join(layout.blotterHome, "state", "last-run.json"),
			`${JSON.stringify(stamp(new Date(now - 5 * 60 * 1000).toISOString(), false))}\n`,
		);

		const result = await runCli(["doctor", "--json"], {
			home: layout.home,
			env: { BLOTTER_HOME: layout.blotterHome },
		});

		const report = JSON.parse(result.stdout) as DoctorJson;
		expect(result.code).toBe(2);
		expect(report.ok).toBe(false);
		expect(report.facts.find(({ id }) => id === "fresh")).toMatchObject({
			status: "problem",
			detail: expect.stringMatching(/last success 3h ago; latest run failed [45]m ago/),
		});
	});

	test("reports a missing success stamp as never succeeded", async () => {
		const layout = await initializedHome();
		await rm(join(layout.blotterHome, "state", "last-success.json"));

		const result = await runCli(["doctor", "--json"], {
			home: layout.home,
			env: { BLOTTER_HOME: layout.blotterHome },
		});

		const report = JSON.parse(result.stdout) as DoctorJson;
		expect(result.code).toBe(2);
		expect(report.facts.find(({ id }) => id === "fresh")).toMatchObject({
			status: "problem",
			detail: "never succeeded",
		});
	});

	test("classifies missing, stale, pending, orphaned, and index drift per harness", async () => {
		const home = await makeTempHome();
		homes.push(home);
		const blotterHome = join(home, "blotter");
		const archiveRoot = join(home, "archive");
		const claudeConfigDir = join(home, "stores", "claude");
		const claudeRoot = join(claudeConfigDir, "projects");
		const codexRoot = join(home, "stores", "codex");
		const piRoot = join(home, "stores", "pi");
		const env = {
			BLOTTER_HOME: blotterHome,
			CLAUDE_CONFIG_DIR: claudeConfigDir,
			CODEX_HOME: codexRoot,
			PI_CODING_AGENT_SESSION_DIR: piRoot,
		};
		const initialMtime = Date.now() - 4 * 60 * 60 * 1000;
		const gapMtime = Date.now() - 3 * 60 * 60 * 1000;
		const claude = await makeClaudeStore(claudeRoot, { main: { mtimeMs: initialMtime }, sidecars: [] });
		const codex = await makeCodexStore(codexRoot, { mtimeMs: initialMtime });
		const initialized = await runCli(
			["init", "--yes", "--archive-root", archiveRoot, "--offbox", "skip", "--no-activate"],
			{ home, env },
		);
		expect(initialized.code).toBe(0);

		await rm(claude.files[0]!.absPath);
		await appendJsonLine(codex.files[0]!, { type: "synthetic-stale" }, gapMtime);
		await makeCodexStore(codexRoot, {
			id: "44444444-4444-4444-8444-444444444444",
			timestamp: "2026-01-03T03-04-05",
			mtimeMs: gapMtime,
		});
		await makePiStore(piRoot, { mtimeMs: Date.now() });
		const config = JSON.parse(await readFile(join(blotterHome, "config.json"), "utf8")) as { machine: string };
		const indexPath = join(archiveRoot, config.machine, "index.jsonl");
		const indexLines = (await readFile(indexPath, "utf8")).trimEnd().split("\n");
		await writeFile(indexPath, `${indexLines.slice(1).join("\n")}\nnot-json\n`);

		const result = await runCli(["doctor", "--json"], { home, env });

		const report = JSON.parse(result.stdout) as DoctorJson;
		const reconciled = report.facts.find(({ id }) => id === "reconciled");
		const data = reconciled?.data as ReconciledData;
		expect(result.code).toBe(2);
		expect(reconciled).toMatchObject({ status: "problem", detail: expect.stringContaining("coverage gaps") });
		expect(data.totals).toMatchObject({ missing: 1, stale: 1, pending: 1, orphaned: 1 });
		expect(data.harnesses["claude-code"]).toMatchObject({ orphaned: 1 });
		expect(data.harnesses.codex).toMatchObject({ missing: 1, stale: 1 });
		expect(data.harnesses.pi).toMatchObject({ pending: 1 });
		expect(data.indexDrift).toMatchObject({ unindexed: 1, missingFromTree: 0, corruptLines: 1 });
	});

	test("reports configured off-box without a success stamp as a problem", async () => {
		const layout = await initializedHome();
		const configPath = join(layout.blotterHome, "config.json");
		const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
		config.offbox = {
			mode: "configured",
			recipient: "age1synthetic",
			remote: { destination: "/synthetic/remote", rcloneConfig: "managed" },
		};
		await writeFile(configPath, `${JSON.stringify(config)}\n`);

		const result = await runCli(["doctor", "--json"], {
			home: layout.home,
			env: { BLOTTER_HOME: layout.blotterHome },
		});

		const report = JSON.parse(result.stdout) as DoctorJson;
		expect(result.code).toBe(2);
		expect(report.facts.find(({ id }) => id === "offbox")).toMatchObject({
			status: "problem",
			detail: "off-box has never succeeded",
		});
	});

	test("makes unsupported stores visible without treating them as failures", async () => {
		const layout = await initializedHome();
		const opencodePath = join(layout.home, ".local", "share", "opencode", "opencode.db");
		await mkdir(join(layout.home, ".local", "share", "opencode"), { recursive: true });
		await writeFile(opencodePath, "");

		const result = await runCli(["doctor", "--json"], {
			home: layout.home,
			env: { BLOTTER_HOME: layout.blotterHome },
		});

		const report = JSON.parse(result.stdout) as DoctorJson;
		expect(report.facts.find(({ id }) => id === "unsupported-opencode")).toMatchObject({
			status: "info",
			detail: `found opencode at ${opencodePath} — not yet supported`,
		});
	});

	test("reports unreadable source stores and an unwritable archive root as problems", async () => {
		const layout = await initializedHome();
		const codexRoot = join(layout.home, ".codex");
		await mkdir(codexRoot, { recursive: true });
		await chmod(codexRoot, 0);
		await chmod(layout.archiveRoot, 0o500);

		let result: Awaited<ReturnType<typeof runCli>>;
		try {
			result = await runCli(["doctor", "--json"], {
				home: layout.home,
				env: { BLOTTER_HOME: layout.blotterHome },
			});
		} finally {
			await chmod(codexRoot, 0o700);
			await chmod(layout.archiveRoot, 0o700);
		}

		const report = JSON.parse(result.stdout) as DoctorJson;
		expect(result.code).toBe(2);
		expect(report.facts.find(({ id }) => id === "stores-readable")).toMatchObject({ status: "problem" });
		expect(report.facts.find(({ id }) => id === "archive-writable")).toMatchObject({ status: "problem" });
	});

	test("accepts no options besides a single --json", async () => {
		const layout = await initializedHome();
		const result = await runCli(["doctor", "--json", "--json"], {
			home: layout.home,
			env: { BLOTTER_HOME: layout.blotterHome },
		});

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("only --json is accepted");
		expect(result.stderr).toContain("Usage: blotter doctor [--json]");
	});
});
