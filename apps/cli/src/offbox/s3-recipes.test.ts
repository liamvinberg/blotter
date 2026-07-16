import { describe, expect, test } from "vitest";
import { cloudflareR2Endpoint, guidedS3Destination } from "./s3-recipes.js";

describe("guided S3 recipes", () => {
	test("derives the Cloudflare endpoint", () => {
		expect(cloudflareR2Endpoint("0123456789abcdef0123456789abcdef")).toBe(
			"https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
		);
	});

	test("reserves the packbat prefix below the selected bucket", () => {
		expect(guidedS3Destination("agent-archives")).toBe("packbat:agent-archives/packbat");
	});

	test("rejects malformed account and bucket values", () => {
		expect(() => cloudflareR2Endpoint("not-an-account")).toThrow("Cloudflare account ID");
		expect(() => guidedS3Destination("bucket/prefix")).toThrow("Bucket must be");
	});
});
