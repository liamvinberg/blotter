import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { createDropboxCodeChallenge, createDropboxCodeVerifier } from "./dropbox-oauth.js";

describe("Dropbox PKCE", () => {
	test("creates a high-entropy RFC 7636 verifier", () => {
		const first = createDropboxCodeVerifier();
		const second = createDropboxCodeVerifier();

		expect(first).toMatch(/^[A-Za-z0-9_-]{86}$/u);
		expect(second).toMatch(/^[A-Za-z0-9_-]{86}$/u);
		expect(first).not.toBe(second);
	});

	test("derives an S256 base64url challenge", () => {
		const verifier = "test-verifier-with-enough-entropy-for-the-rfc7636-example";
		const expected = createHash("sha256").update(verifier, "ascii").digest("base64url");

		expect(createDropboxCodeChallenge(verifier)).toBe(expected);
		expect(expected).toMatch(/^[A-Za-z0-9_-]{43}$/u);
	});
});
