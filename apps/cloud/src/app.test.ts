import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

interface MutableVersionBindings {
	MIN_CLI_VERSION?: string;
	NPM_REGISTRY_URL?: string;
}

const versionBindings = env as MutableVersionBindings;

afterEach(() => {
	versionBindings.MIN_CLI_VERSION = "0.1.0";
	delete versionBindings.NPM_REGISTRY_URL;
	vi.restoreAllMocks();
});

describe("CLI versions", () => {
	it("reads prerelease and malformed client versions through the gate and headers", async () => {
		versionBindings.MIN_CLI_VERSION = "0.1.0";
		versionBindings.NPM_REGISTRY_URL = "https://registry-parsing.test";
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ version: "9.9.9" }));

		const prerelease = await exports.default.fetch("https://api.packbat.dev/v1/client", {
			headers: { "x-packbat-cli-version": "0.1.0-canary.1" },
		});
		expect(prerelease.status).toBe(200);
		expect(prerelease.headers.get("x-packbat-cli-update")).toBe("9.9.9");

		const equalPrerelease = await exports.default.fetch("https://api.packbat.dev/v1/client", {
			headers: { "x-packbat-cli-version": "9.9.9-beta.2" },
		});
		expect(equalPrerelease.status).toBe(200);
		expect(equalPrerelease.headers.get("x-packbat-cli-update")).toBeNull();

		const malformed = await exports.default.fetch("https://api.packbat.dev/v1/client", {
			headers: { "x-packbat-cli-version": "0.invalid.9" },
		});
		expect(malformed.status).toBe(426);
		expect(await malformed.json()).toEqual({ error: "cli_outdated" });
	});

	it("gates outdated clients before public and authenticated routes", async () => {
		versionBindings.MIN_CLI_VERSION = "0.1.0";
		const headers = { "x-packbat-cli-version": "0.0.9" };

		const [authenticated, client] = await Promise.all([
			exports.default.fetch("https://api.packbat.dev/v1/billing/status", { headers }),
			exports.default.fetch("https://api.packbat.dev/v1/client", { headers }),
		]);

		for (const response of [authenticated, client]) {
			expect(response.status).toBe(426);
			expect(await response.json()).toEqual({ error: "cli_outdated" });
		}
	});

	it("excludes the Stripe webhook from CLI version handling", async () => {
		versionBindings.MIN_CLI_VERSION = "99.0.0";

		const response = await exports.default.fetch("https://api.packbat.dev/v1/billing/webhook", {
			body: "{}",
			method: "POST",
		});

		expect(response.status).not.toBe(426);
		expect(response.headers.get("x-packbat-cli-latest")).toBeNull();
		expect(response.headers.get("x-packbat-cli-update")).toBeNull();
	});

	it("advertises the latest version and an available update", async () => {
		versionBindings.NPM_REGISTRY_URL = "https://registry-update.test";
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request = new Request(input, init);
			expect(request.url).toBe("https://registry-update.test/packbat/latest");
			return Response.json({ version: "9.9.9" });
		});

		const response = await exports.default.fetch("https://api.packbat.dev/v1/client", {
			headers: { "x-packbat-cli-version": "0.1.0" },
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-packbat-cli-latest")).toBe("9.9.9");
		expect(response.headers.get("x-packbat-cli-update")).toBe("9.9.9");
	});

	it("omits the update header when the client is current", async () => {
		versionBindings.NPM_REGISTRY_URL = "https://registry-current.test";
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ version: "9.9.9" }));

		const response = await exports.default.fetch("https://api.packbat.dev/v1/client", {
			headers: { "x-packbat-cli-version": "9.9.9" },
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-packbat-cli-latest")).toBe("9.9.9");
		expect(response.headers.get("x-packbat-cli-update")).toBeNull();
	});

	it("continues without version headers when the registry is unreachable", async () => {
		versionBindings.NPM_REGISTRY_URL = "https://registry-unreachable.test";
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("registry unavailable"));

		const response = await exports.default.fetch("https://api.packbat.dev/v1/client", {
			headers: { "x-packbat-cli-version": "0.1.0" },
		});

		expect(response.status).toBe(200);
		expect(response.headers.get("x-packbat-cli-latest")).toBeNull();
		expect(response.headers.get("x-packbat-cli-update")).toBeNull();
	});

	it("treats a missing version header as version 0.1.0", async () => {
		versionBindings.MIN_CLI_VERSION = "0.1.0";
		versionBindings.NPM_REGISTRY_URL = "https://registry-headerless.test";
		vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ version: "0.1.0" }));

		const response = await exports.default.fetch("https://api.packbat.dev/v1/client");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ githubClientId: "Ov23liPackbatCloudTest" });
	});
});

describe("public client configuration", () => {
	it("exposes only the public GitHub OAuth client ID without caching", async () => {
		versionBindings.NPM_REGISTRY_URL = "https://registry-client-config.test";
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("registry unavailable"));
		const response = await exports.default.fetch("https://api.packbat.dev/v1/client");

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(await response.json()).toEqual({ githubClientId: "Ov23liPackbatCloudTest" });
	});
});
