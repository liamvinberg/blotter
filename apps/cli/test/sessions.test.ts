import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { makeRetrievalLayout, type RetrievalLayout, writeArchivedJsonl } from "./helpers/retrieval-fixtures.js";
import { runCli } from "./helpers/run-cli.js";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_ID = "33333333-3333-4333-8333-333333333333";
const homes: string[] = [];

interface SessionsJson {
	v: 1;
	filters: {
		project: string | null;
		since: string | null;
		harness: string | null;
		machine: string | null;
		file: string | null;
		command: string | null;
	};
	sessions: Array<{
		key: string;
		harness: string;
		machine: string;
		startedAt: string | null;
		updatedAt: string | null;
		turns: number;
		projects: string[];
		head: string | null;
	}>;
	truncated: boolean;
}

async function layout(): Promise<RetrievalLayout> {
	const value = await makeRetrievalLayout();
	homes.push(value.home);
	return value;
}

function command(layout: RetrievalLayout, args: string[]) {
	return runCli(args, { home: layout.home, env: layout.env });
}

afterEach(async () => {
	await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("packbat sessions", () => {
	test("applies every filter alone and combines filters with AND", async () => {
		const test = await layout();
		await writeArchivedJsonl({
			layout: test,
			machine: "first-machine",
			harness: "codex",
			unit: FIRST_ID,
			relPath: `sessions/2026/07/17/rollout-2026-07-17T10-00-00-${FIRST_ID}.jsonl`,
			lines: [
				{ type: "session_meta", timestamp: "2026-07-18T10:00:00Z", payload: { id: FIRST_ID, cwd: "/alpha" } },
				{
					type: "response_item",
					timestamp: "2026-07-18T10:01:00Z",
					payload: { type: "message", role: "user", content: [{ type: "input_text", text: "alpha work" }] },
				},
				{
					type: "response_item",
					timestamp: "2026-07-18T10:02:00Z",
					payload: {
						type: "function_call",
						name: "exec_command",
						arguments: JSON.stringify({ path: "src/Auth.ts", cmd: "pnpm TEST --coverage 100%" }),
					},
				},
			],
		});
		await writeArchivedJsonl({
			layout: test,
			machine: "second-machine",
			harness: "claude-code",
			unit: SECOND_ID,
			relPath: `-beta/${SECOND_ID}.jsonl`,
			lines: [
				{
					type: "user",
					cwd: "/beta",
					timestamp: "2026-07-16T10:00:00Z",
					message: { role: "user", content: "beta work" },
				},
				{
					type: "assistant",
					timestamp: "2026-07-16T10:01:00Z",
					message: {
						role: "assistant",
						content: [
							{
								type: "tool_use",
								name: "exec_command",
								input: { path: "src/billing.ts", cmd: "pnpm lint --coverage 1000" },
							},
						],
					},
				},
			],
		});

		const cases = [
			["--project", "/alpha"],
			["--since", "2026-07-17"],
			["--harness", "codex"],
			["--machine", "first-machine"],
			["--file", "auth"],
			["--command", "PNPM test"],
		] as const;
		for (const [option, value] of cases) {
			const result = await command(test, ["sessions", option, value, "--json"]);
			expect(result.code, result.stderr).toBe(0);
			expect(
				(JSON.parse(result.stdout) as { sessions: Array<{ key: string }> }).sessions.map((session) => session.key),
			).toEqual([`first-machine/codex/${FIRST_ID}`]);
		}

		const combined = await command(test, [
			"sessions",
			"--project",
			"/alpha",
			"--since",
			"2026-07-17T00:00:00Z",
			"--harness",
			"codex",
			"--machine",
			"first-machine",
			"--file",
			"AUTH",
			"--command",
			"test",
			"--json",
		]);
		expect(combined.code, combined.stderr).toBe(0);
		expect(JSON.parse(combined.stdout)).toMatchObject({
			filters: {
				project: resolve("/alpha"),
				since: "2026-07-17T00:00:00.000Z",
				harness: "codex",
				machine: "first-machine",
				file: "AUTH",
				command: "test",
			},
			sessions: [{ key: `first-machine/codex/${FIRST_ID}` }],
		});
		const mismatchedCombination = await command(test, [
			"sessions",
			"--project",
			"/alpha",
			"--machine",
			"second-machine",
			"--json",
		]);
		expect((JSON.parse(mismatchedCombination.stdout) as SessionsJson).sessions).toEqual([]);

		const literalPercent = await command(test, ["sessions", "--command", "100%", "--json"]);
		expect(literalPercent.code, literalPercent.stderr).toBe(0);
		expect((JSON.parse(literalPercent.stdout) as { sessions: Array<{ key: string }> }).sessions).toEqual([
			expect.objectContaining({ key: `first-machine/codex/${FIRST_ID}` }),
		]);

		const fleet = JSON.parse((await command(test, ["sessions", "--json"])).stdout) as SessionsJson;
		expect(fleet.sessions.map((session) => session.key)).toEqual([
			`first-machine/codex/${FIRST_ID}`,
			`second-machine/claude-code/${SECOND_ID}`,
		]);
	});

	test("orders newest first with timestampless sessions last", async () => {
		const test = await layout();
		for (const [unit, timestamp, text] of [
			[FIRST_ID, "2026-07-17T10:00:00Z", "older"],
			[SECOND_ID, "2026-07-18T10:00:00Z", "newer"],
			[THIRD_ID, null, "without time"],
		] as const) {
			await writeArchivedJsonl({
				layout: test,
				harness: "claude-code",
				unit,
				relPath: `-ordering/${unit}.jsonl`,
				lines: [
					{
						type: "user",
						...(timestamp === null ? {} : { timestamp }),
						message: { role: "user", content: text },
					},
				],
			});
		}

		const result = JSON.parse((await command(test, ["sessions", "--json"])).stdout) as SessionsJson;

		expect(result.sessions.map((session) => session.key)).toEqual([
			`test-machine/claude-code/${SECOND_ID}`,
			`test-machine/claude-code/${FIRST_ID}`,
			`test-machine/claude-code/${THIRD_ID}`,
		]);
		expect(result.sessions.at(-1)).toMatchObject({ startedAt: null, updatedAt: null });
	});

	test("caps results, reports truncation, and rejects invalid limits", async () => {
		const test = await layout();
		for (const [unit, timestamp] of [
			[FIRST_ID, "2026-07-17T10:00:00Z"],
			[SECOND_ID, "2026-07-18T10:00:00Z"],
		] as const) {
			await writeArchivedJsonl({
				layout: test,
				harness: "claude-code",
				unit,
				relPath: `-limit/${unit}.jsonl`,
				lines: [{ type: "user", timestamp, message: { role: "user", content: unit } }],
			});
		}

		const jsonResult = await command(test, ["sessions", "--limit", "1", "--json"]);
		expect(jsonResult.code, jsonResult.stderr).toBe(0);
		expect(JSON.parse(jsonResult.stdout)).toMatchObject({
			truncated: true,
			sessions: [{ key: `test-machine/claude-code/${SECOND_ID}` }],
		});
		const plainResult = await command(test, ["sessions", "--limit", "1"]);
		expect(plainResult.code, plainResult.stderr).toBe(0);
		expect(plainResult.stdout).toContain("showing 1 of more · narrow with filters or raise --limit\n");

		for (const invalid of ["0", "201", "1.5", "many"]) {
			const result = await command(test, ["sessions", "--limit", invalid]);
			expect(result.code).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain("Usage: packbat sessions");
		}
	});

	test("keeps the JSON v1 fields stable when a session has no user turn", async () => {
		const test = await layout();
		await writeArchivedJsonl({
			layout: test,
			harness: "codex",
			unit: FIRST_ID,
			relPath: `sessions/2026/07/18/rollout-2026-07-18T10-00-00-${FIRST_ID}.jsonl`,
			lines: [
				{
					type: "response_item",
					timestamp: "2026-07-18T10:00:00Z",
					payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "assistant only" }] },
				},
			],
		});

		const result = JSON.parse((await command(test, ["sessions", "--json"])).stdout) as SessionsJson;

		expect(result).toEqual({
			v: 1,
			filters: { project: null, since: null, harness: null, machine: null, file: null, command: null },
			sessions: [
				{
					key: `test-machine/codex/${FIRST_ID}`,
					harness: "codex",
					machine: "test-machine",
					startedAt: "2026-07-18T10:00:00.000Z",
					updatedAt: "2026-07-18T10:00:00.000Z",
					turns: 1,
					projects: [],
					head: null,
				},
			],
			truncated: false,
		});
	});

	test("prints session summaries, flattens and caps the first user turn, and handles no matches", async () => {
		const test = await layout();
		await writeArchivedJsonl({
			layout: test,
			harness: "codex",
			unit: FIRST_ID,
			relPath: `sessions/2026/07/18/rollout-2026-07-18T10-00-00-${FIRST_ID}.jsonl`,
			lines: [
				{ type: "session_meta", payload: { id: FIRST_ID, cwd: "/zeta" } },
				{
					type: "response_item",
					timestamp: "2026-07-18T10:00:00Z",
					payload: {
						type: "message",
						role: "user",
						content: [
							{
								type: "input_text",
								text: "  1234567890   1234567890\n1234567890 1234567890 1234567890 1234567890  ",
							},
						],
					},
				},
				{ type: "turn_context", payload: { cwd: "/alpha" } },
				{
					type: "response_item",
					timestamp: "2026-07-18T10:01:00Z",
					payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] },
				},
			],
		});

		const jsonResult = JSON.parse((await command(test, ["sessions", "--json"])).stdout) as SessionsJson;
		expect(jsonResult.sessions[0]).toMatchObject({
			turns: 2,
			projects: ["/alpha", "/zeta"],
			head: "1234567890 1234567890 1234567890 1234567890 1234567890 12345",
		});
		const plain = await command(test, ["sessions"]);
		expect(plain.code, plain.stderr).toBe(0);
		expect(plain.stdout).toBe(
			`test-machine/codex/${FIRST_ID} · 2026-07-18T10:00:00.000Z→2026-07-18T10:01:00.000Z · 2 turns\n` +
				"projects: /alpha, /zeta\n" +
				'"1234567890 1234567890 1234567890 1234567890 1234567890 12345"\n',
		);

		const empty = await command(test, ["sessions", "--machine", "missing"]);
		expect(empty.code, empty.stderr).toBe(0);
		expect(empty.stdout).toBe("no sessions matched\n");
	});
});
