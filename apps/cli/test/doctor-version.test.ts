import { readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { makeTempHome, runCli } from "./helpers/run-cli.js";

const homes: string[] = [];
const servers: Server[] = [];
const packageVersion = (
	JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

async function closeServer(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

async function listen(server: Server): Promise<number> {
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("fake registry did not bind a TCP port");
	}
	return address.port;
}

async function startRegistry(version: string): Promise<{ url: string; requestCount: () => number }> {
	let requests = 0;
	const server = createServer((request, response) => {
		requests += 1;
		if (request.url !== "/packbat/latest") {
			response.writeHead(404).end();
			return;
		}
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({ version }));
	});
	const port = await listen(server);
	servers.push(server);
	return { url: `http://127.0.0.1:${port}`, requestCount: () => requests };
}

async function closedRegistryUrl(): Promise<string> {
	const server = createServer();
	const port = await listen(server);
	await closeServer(server);
	return `http://127.0.0.1:${port}`;
}

async function initializedHome(): Promise<{ home: string; packbatHome: string }> {
	const home = await makeTempHome();
	homes.push(home);
	const packbatHome = join(home, "packbat");
	const result = await runCli(
		["init", "--yes", "--archive-root", join(home, "archive"), "--offbox", "skip", "--no-activate"],
		{ home, env: { PACKBAT_HOME: packbatHome } },
	);
	expect(result.code, result.stderr).toBe(0);
	return { home, packbatHome };
}

afterEach(async () => {
	await Promise.all(servers.splice(0).map(closeServer));
	await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("packbat doctor version fact", () => {
	test("reports an available update without changing doctor's exit code", async () => {
		const layout = await initializedHome();
		const registry = await startRegistry("9.9.9");
		const env = { PACKBAT_HOME: layout.packbatHome, PACKBAT_REGISTRY_URL: registry.url };

		const result = await runCli(["doctor"], { home: layout.home, env });
		const withoutVersionFact = await runCli(["doctor", "--json"], { home: layout.home, env });

		expect(result.stdout).toContain("latest is 9.9.9, update with npm install --global packbat@latest");
		expect(result.stdout).not.toContain("\n  version:");
		expect(result.code).toBe(withoutVersionFact.code);
		expect([0, 2]).toContain(result.code);
		expect(registry.requestCount()).toBe(1);
	});

	test("reports when the installed version is the latest", async () => {
		const layout = await initializedHome();
		const registry = await startRegistry(packageVersion);

		const result = await runCli(["doctor"], {
			home: layout.home,
			env: { PACKBAT_HOME: layout.packbatHome, PACKBAT_REGISTRY_URL: registry.url },
		});

		expect(result.stdout).toContain(`${packageVersion} is the latest`);
		expect([0, 2]).toContain(result.code);
		expect(registry.requestCount()).toBe(1);
	});

	test("reports a failed lookup and still completes", async () => {
		const layout = await initializedHome();
		const registryUrl = await closedRegistryUrl();

		const result = await runCli(["doctor"], {
			home: layout.home,
			env: { PACKBAT_HOME: layout.packbatHome, PACKBAT_REGISTRY_URL: registryUrl },
		});

		expect(result.stdout).toContain(`${packageVersion}, could not check the latest version`);
		expect([0, 2]).toContain(result.code);
		expect(result.stderr).toBe("");
	});

	test("never checks the registry or adds a version fact in JSON mode", async () => {
		const layout = await initializedHome();
		const registry = await startRegistry("9.9.9");

		const result = await runCli(["doctor", "--json"], {
			home: layout.home,
			env: { PACKBAT_HOME: layout.packbatHome, PACKBAT_REGISTRY_URL: registry.url },
		});
		const report = JSON.parse(result.stdout) as {
			version: string;
			facts: Array<{ title: string }>;
		};

		expect(registry.requestCount()).toBe(0);
		expect(report.version).toBe(packageVersion);
		expect(report.facts.some(({ title }) => title === "version")).toBe(false);
		expect([0, 2]).toContain(result.code);
	});
});
