import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { backblazeRegion, discoverBackblazeS3Endpoint } from "./backblaze.js";

let server: Server | undefined;

afterEach(async () => {
	if (server === undefined) return;
	await new Promise<void>((resolve, reject) => {
		server?.close((error) => {
			if (error === undefined) resolve();
			else reject(error);
		});
	});
	server = undefined;
});

async function providerUrl(status: number, response: unknown, expectedAuthorization: string): Promise<string> {
	server = createServer((request, providerResponse) => {
		if (request.headers.authorization !== expectedAuthorization) {
			providerResponse.writeHead(401).end();
			return;
		}
		providerResponse.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(response));
	});
	await new Promise<void>((resolve, reject) => {
		server?.once("error", reject);
		server?.listen(0, "127.0.0.1", () => resolve());
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("provider fake did not bind");
	return `http://127.0.0.1:${address.port}/b2api/v4/b2_authorize_account`;
}

describe("Backblaze endpoint discovery", () => {
	test("derives the S3 endpoint from the two application key values", async () => {
		const keyId = "synthetic-key-id";
		const applicationKey = "synthetic-application-key";
		const url = await providerUrl(
			200,
			{ apiInfo: { storageApi: { s3ApiUrl: "https://s3.eu-central-003.backblazeb2.com/" } } },
			`Basic ${Buffer.from(`${keyId}:${applicationKey}`).toString("base64")}`,
		);

		await expect(discoverBackblazeS3Endpoint(keyId, applicationKey, url)).resolves.toBe(
			"https://s3.eu-central-003.backblazeb2.com",
		);
		expect(backblazeRegion("https://s3.eu-central-003.backblazeb2.com")).toBe("eu-central-003");
	});

	test("redacts provider response details when authorization fails", async () => {
		const privateDetail = "synthetic-private-provider-detail";
		const url = await providerUrl(
			401,
			{ code: "unauthorized", message: privateDetail },
			`Basic ${Buffer.from("key:secret").toString("base64")}`,
		);

		await expect(discoverBackblazeS3Endpoint("key", "secret", url)).rejects.toThrow(
			"Backblaze B2 could not verify the application key (HTTP 401)",
		);
		await expect(discoverBackblazeS3Endpoint("key", "secret", url)).rejects.not.toThrow(privateDetail);
	});
});
