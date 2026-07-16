import { describe, expect, test } from "vitest";
import { cloudflareR2Endpoint, guidedS3Destination, parseR2Token } from "./s3-recipes.js";

describe("guided S3 recipes", () => {
	test("derives the Cloudflare endpoint and splits its one token paste", () => {
		expect(cloudflareR2Endpoint("0123456789abcdef0123456789abcdef")).toBe(
			"https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
		);
		expect(parseR2Token("access-key-id:secret-access-key")).toEqual({
			accessKeyId: "access-key-id",
			secretAccessKey: "secret-access-key",
		});
	});

	test("reserves the packbat prefix below the selected bucket", () => {
		expect(guidedS3Destination("agent-archives")).toBe("packbat:agent-archives/packbat");
	});

	test("rejects malformed account, token, and bucket values without echoing secrets", () => {
		expect(() => cloudflareR2Endpoint("not-an-account")).toThrow("Cloudflare account ID");
		expect(() => parseR2Token("secret-only")).toThrow("R2 token must be");
		expect(() => guidedS3Destination("bucket/prefix")).toThrow("Bucket must be");
	});
});
