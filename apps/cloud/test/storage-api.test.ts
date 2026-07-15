import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";

interface LinkedAccount {
	accessToken: string;
	account: { id: string; quotaBytes: number; reservedBytes: number; usedBytes: number };
}

interface ReservationResponse {
	reservationId: string;
	state: "pending";
	upload: {
		expiresAt: string;
		headers: Record<string, string>;
		url: string;
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

function jsonRequest(path: string, body: unknown, accessToken?: string): Request {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (accessToken !== undefined) {
		headers.Authorization = `Bearer ${accessToken}`;
	}
	return new Request(`https://api.packbat.dev${path}`, {
		body: JSON.stringify(body),
		headers,
		method: "POST",
	});
}

function mockGitHubUsers(usersByToken: Record<string, { id: number; login: string }>): void {
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const request = new Request(input, init);
		const authorization = request.headers.get("Authorization");
		const token = authorization?.replace(/^Bearer /u, "");
		const user = token === undefined ? undefined : usersByToken[token];
		return user === undefined ? Response.json({ message: "Bad credentials" }, { status: 401 }) : Response.json(user);
	});
}

async function exchange(githubAccessToken = "github-token"): Promise<LinkedAccount> {
	const response = await exports.default.fetch(jsonRequest("/v1/auth/github/exchange", { githubAccessToken }));
	expect(response.status).toBe(200);
	return (await response.json()) as LinkedAccount;
}

async function createMachine(accessToken: string): Promise<string> {
	const response = await exports.default.fetch(jsonRequest("/v1/machines", {}, accessToken));
	expect(response.status).toBe(201);
	return ((await response.json()) as { id: string }).id;
}

function bytesToBase64(value: ArrayBuffer): string {
	let binary = "";
	for (const byte of new Uint8Array(value)) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

async function checksum(bytes: Uint8Array): Promise<{ digest: ArrayBuffer; value: string }> {
	const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
	return { digest, value: bytesToBase64(digest) };
}

async function reserve(
	accessToken: string,
	input: {
		bytes: Uint8Array;
		expectedIndexEtag?: string | null;
		idempotencyKey: string;
		logicalObjectKey: string;
		machineRemoteId: string;
	},
): Promise<Response> {
	const expectedChecksum = await checksum(input.bytes);
	const { bytes, ...rest } = input;
	return await exports.default.fetch(
		jsonRequest(
			"/v1/uploads/reservations",
			{
				...rest,
				checksumSha256: expectedChecksum.value,
				expectedBytes: bytes.byteLength,
			},
			accessToken,
		),
	);
}

async function storagePrefix(userId: string): Promise<string> {
	const account = await env.DB.prepare("SELECT storage_prefix AS storagePrefix FROM users WHERE id = ?")
		.bind(userId)
		.first<{ storagePrefix: string }>();
	if (account === null) {
		throw new Error("test account has no storage prefix");
	}
	return account.storagePrefix;
}

async function putObject(
	userId: string,
	machineRemoteId: string,
	logicalObjectKey: string,
	bytes: Uint8Array,
): Promise<R2Object> {
	const expectedChecksum = await checksum(bytes);
	const object = await env.ARCHIVE_BUCKET.put(
		`users/${await storagePrefix(userId)}/machines/${machineRemoteId}/${logicalObjectKey}`,
		bytes,
		{
			httpMetadata: { contentType: "application/octet-stream" },
			sha256: expectedChecksum.digest,
		},
	);
	if (object === null) {
		throw new Error("test R2 PUT did not create an object");
	}
	return object;
}

async function finalize(accessToken: string, reservationId: string): Promise<Response> {
	return await exports.default.fetch(jsonRequest(`/v1/uploads/${reservationId}/finalize`, {}, accessToken));
}

describe("ciphertext uploads", () => {
	it("reserves, signs, verifies, accounts, and downloads one exact object", async () => {
		mockGitHubUsers({ "github-token": { id: 42_424, login: "octocat" } });
		const linked = await exchange();
		const machineRemoteId = await createMachine(linked.accessToken);
		const bytes = new TextEncoder().encode("ciphertext");
		const logicalObjectKey = "claude/projects/session.jsonl.zst.age";

		const response = await reserve(linked.accessToken, {
			bytes,
			idempotencyKey: "first-upload",
			logicalObjectKey,
			machineRemoteId,
		});
		expect(response.status).toBe(201);
		const reservation = (await response.json()) as ReservationResponse;
		expect(reservation.state).toBe("pending");
		expect(reservation.upload.headers).toEqual({
			"Content-Length": String(bytes.byteLength),
			"Content-Type": "application/octet-stream",
			"x-amz-checksum-sha256": (await checksum(bytes)).value,
		});
		const uploadUrl = new URL(reservation.upload.url);
		expect(uploadUrl.host).toBe("0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com");
		expect(uploadUrl.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(
			expect.arrayContaining(["content-length", "content-type", "host", "x-amz-checksum-sha256"]),
		);
		expect(reservation.upload.url).not.toContain(linked.account.id);

		const repeated = await reserve(linked.accessToken, {
			bytes,
			idempotencyKey: "first-upload",
			logicalObjectKey,
			machineRemoteId,
		});
		expect(repeated.status).toBe(200);
		expect((await repeated.json()) as ReservationResponse).toMatchObject({
			reservationId: reservation.reservationId,
			state: "pending",
		});

		const stored = await putObject(linked.account.id, machineRemoteId, logicalObjectKey, bytes);
		const finalized = await Promise.all([
			finalize(linked.accessToken, reservation.reservationId),
			finalize(linked.accessToken, reservation.reservationId),
		]);
		expect(finalized.map(({ status }) => status)).toEqual([200, 200]);
		expect(await Promise.all(finalized.map(async (item) => await item.json()))).toEqual([
			{ etag: stored.etag },
			{ etag: stored.etag },
		]);
		expect(await (await finalize(linked.accessToken, reservation.reservationId)).json()).toEqual({ etag: stored.etag });

		expect(
			await env.DB.prepare("SELECT used_bytes, reserved_bytes FROM users WHERE id = ?").bind(linked.account.id).first(),
		).toEqual({ reserved_bytes: 0, used_bytes: bytes.byteLength });

		const download = await exports.default.fetch(
			jsonRequest("/v1/downloads", { logicalObjectKey, machineRemoteId }, linked.accessToken),
		);
		expect(download.status).toBe(200);
		const downloadBody = (await download.json()) as { expiresAt: string; url: string };
		expect(new URL(downloadBody.url).searchParams.get("X-Amz-SignedHeaders")).toBe("host");
	});

	it("admits concurrent reservations only while their total stays under quota", async () => {
		mockGitHubUsers({ "github-token": { id: 42_424, login: "octocat" } });
		const linked = await exchange();
		const machineRemoteId = await createMachine(linked.accessToken);
		await env.DB.prepare("UPDATE users SET quota_bytes = 10 WHERE id = ?").bind(linked.account.id).run();

		const responses = await Promise.all([
			reserve(linked.accessToken, {
				bytes: new Uint8Array(7),
				idempotencyKey: "quota-a",
				logicalObjectKey: "claude/a.age",
				machineRemoteId,
			}),
			reserve(linked.accessToken, {
				bytes: new Uint8Array(7),
				idempotencyKey: "quota-b",
				logicalObjectKey: "claude/b.age",
				machineRemoteId,
			}),
		]);

		expect(responses.map(({ status }) => status).sort()).toEqual([201, 413]);
		expect(
			await env.DB.prepare("SELECT used_bytes, reserved_bytes FROM users WHERE id = ?").bind(linked.account.id).first(),
		).toEqual({ reserved_bytes: 7, used_bytes: 0 });
	});

	it("moves replaced bytes between used and reserved accounting and restores them on expiry", async () => {
		mockGitHubUsers({ "github-token": { id: 42_424, login: "octocat" } });
		const linked = await exchange();
		const machineRemoteId = await createMachine(linked.accessToken);
		const logicalObjectKey = "opencode/session.age";
		await env.DB.prepare("UPDATE users SET quota_bytes = 10 WHERE id = ?").bind(linked.account.id).run();

		const initialBytes = new Uint8Array(8);
		const initialResponse = await reserve(linked.accessToken, {
			bytes: initialBytes,
			idempotencyKey: "initial-version",
			logicalObjectKey,
			machineRemoteId,
		});
		const initial = (await initialResponse.json()) as ReservationResponse;
		await putObject(linked.account.id, machineRemoteId, logicalObjectKey, initialBytes);
		expect((await finalize(linked.accessToken, initial.reservationId)).status).toBe(200);

		const replacementBytes = new Uint8Array(6);
		const replacementResponse = await reserve(linked.accessToken, {
			bytes: replacementBytes,
			idempotencyKey: "replacement-version",
			logicalObjectKey,
			machineRemoteId,
		});
		const replacement = (await replacementResponse.json()) as ReservationResponse;
		expect(
			await env.DB.prepare("SELECT used_bytes, reserved_bytes FROM users WHERE id = ?").bind(linked.account.id).first(),
		).toEqual({ reserved_bytes: 6, used_bytes: 0 });
		await putObject(linked.account.id, machineRemoteId, logicalObjectKey, replacementBytes);
		expect((await finalize(linked.accessToken, replacement.reservationId)).status).toBe(200);
		expect(
			await env.DB.prepare("SELECT used_bytes, reserved_bytes FROM users WHERE id = ?").bind(linked.account.id).first(),
		).toEqual({ reserved_bytes: 0, used_bytes: 6 });

		const expiringResponse = await reserve(linked.accessToken, {
			bytes: new Uint8Array(5),
			idempotencyKey: "expiring-replacement",
			logicalObjectKey,
			machineRemoteId,
		});
		const expiring = (await expiringResponse.json()) as ReservationResponse;
		await env.DB.prepare("UPDATE upload_reservations SET created_at = 0, expires_at = 1 WHERE id = ?")
			.bind(expiring.reservationId)
			.run();

		const next = await reserve(linked.accessToken, {
			bytes: new Uint8Array(4),
			idempotencyKey: "other-object",
			logicalObjectKey: "opencode/other.age",
			machineRemoteId,
		});
		expect(next.status).toBe(201);
		expect(
			await env.DB.prepare("SELECT used_bytes, reserved_bytes FROM users WHERE id = ?").bind(linked.account.id).first(),
		).toEqual({ reserved_bytes: 4, used_bytes: 6 });
		expect(
			await env.DB.prepare("SELECT state FROM upload_reservations WHERE id = ?").bind(expiring.reservationId).first(),
		).toEqual({ state: "expired" });
	});

	it("reconciles an expired uploaded object before releasing another reservation", async () => {
		mockGitHubUsers({ "github-token": { id: 42_424, login: "octocat" } });
		const linked = await exchange();
		const machineRemoteId = await createMachine(linked.accessToken);
		const firstBytes = new Uint8Array([1, 2, 3]);
		const firstResponse = await reserve(linked.accessToken, {
			bytes: firstBytes,
			idempotencyKey: "expired-upload",
			logicalObjectKey: "codex/first.age",
			machineRemoteId,
		});
		const first = (await firstResponse.json()) as ReservationResponse;
		await putObject(linked.account.id, machineRemoteId, "codex/first.age", firstBytes);
		await env.DB.prepare("UPDATE upload_reservations SET created_at = 0, expires_at = 1 WHERE id = ?")
			.bind(first.reservationId)
			.run();

		const second = await reserve(linked.accessToken, {
			bytes: new Uint8Array([4, 5]),
			idempotencyKey: "next-upload",
			logicalObjectKey: "codex/second.age",
			machineRemoteId,
		});
		expect(second.status).toBe(201);
		expect(
			await env.DB.prepare("SELECT used_bytes, reserved_bytes FROM users WHERE id = ?").bind(linked.account.id).first(),
		).toEqual({ reserved_bytes: 2, used_bytes: 3 });
		expect(
			await env.DB.prepare("SELECT state FROM upload_reservations WHERE id = ?").bind(first.reservationId).first(),
		).toEqual({ state: "completed" });
	});

	it("refuses finalization and removes an object whose length or checksum differs", async () => {
		mockGitHubUsers({ "github-token": { id: 42_424, login: "octocat" } });
		const linked = await exchange();
		const machineRemoteId = await createMachine(linked.accessToken);
		const logicalObjectKey = "gemini/mismatch.age";
		const response = await reserve(linked.accessToken, {
			bytes: new Uint8Array([1, 2, 3]),
			idempotencyKey: "mismatch",
			logicalObjectKey,
			machineRemoteId,
		});
		const reservation = (await response.json()) as ReservationResponse;
		await putObject(linked.account.id, machineRemoteId, logicalObjectKey, new Uint8Array([1, 2, 3, 4]));

		const finalized = await finalize(linked.accessToken, reservation.reservationId);
		expect(finalized.status).toBe(409);
		expect(await finalized.json()).toEqual({ error: "upload_mismatch" });
		expect(
			await env.ARCHIVE_BUCKET.head(
				`users/${await storagePrefix(linked.account.id)}/machines/${machineRemoteId}/${logicalObjectKey}`,
			),
		).toBeNull();
		expect(
			await env.DB.prepare("SELECT used_bytes, reserved_bytes FROM users WHERE id = ?").bind(linked.account.id).first(),
		).toEqual({ reserved_bytes: 3, used_bytes: 0 });
	});
});

describe("index publication", () => {
	it("keeps archives before the index and makes every index update conditional", async () => {
		mockGitHubUsers({ "github-token": { id: 42_424, login: "octocat" } });
		const linked = await exchange();
		const machineRemoteId = await createMachine(linked.accessToken);
		const archiveBytes = new Uint8Array([1]);
		const archiveResponse = await reserve(linked.accessToken, {
			bytes: archiveBytes,
			idempotencyKey: "archive",
			logicalObjectKey: "claude/archive.age",
			machineRemoteId,
		});
		const archive = (await archiveResponse.json()) as ReservationResponse;

		const blockedIndex = await reserve(linked.accessToken, {
			bytes: new Uint8Array([2]),
			expectedIndexEtag: null,
			idempotencyKey: "blocked-index",
			logicalObjectKey: "index.jsonl.age",
			machineRemoteId,
		});
		expect(blockedIndex.status).toBe(409);
		expect(await blockedIndex.json()).toEqual({ error: "archives_pending" });

		await putObject(linked.account.id, machineRemoteId, "claude/archive.age", archiveBytes);
		expect((await finalize(linked.accessToken, archive.reservationId)).status).toBe(200);

		const firstIndexBytes = new Uint8Array([2]);
		const firstIndexResponse = await reserve(linked.accessToken, {
			bytes: firstIndexBytes,
			expectedIndexEtag: null,
			idempotencyKey: "first-index",
			logicalObjectKey: "index.jsonl.age",
			machineRemoteId,
		});
		expect(firstIndexResponse.status).toBe(201);
		const firstIndex = (await firstIndexResponse.json()) as ReservationResponse;
		expect(firstIndex.upload.headers["If-None-Match"]).toBe("*");
		expect(new URL(firstIndex.upload.url).searchParams.get("X-Amz-SignedHeaders")).toContain("if-none-match");
		const firstIndexObject = await putObject(linked.account.id, machineRemoteId, "index.jsonl.age", firstIndexBytes);
		expect((await finalize(linked.accessToken, firstIndex.reservationId)).status).toBe(200);

		const stale = await reserve(linked.accessToken, {
			bytes: new Uint8Array([3]),
			expectedIndexEtag: "stale-etag",
			idempotencyKey: "stale-index",
			logicalObjectKey: "index.jsonl.age",
			machineRemoteId,
		});
		expect(stale.status).toBe(409);
		expect(await stale.json()).toEqual({ error: "index_conflict" });

		const secondIndexResponse = await reserve(linked.accessToken, {
			bytes: new Uint8Array([3]),
			expectedIndexEtag: firstIndexObject.etag,
			idempotencyKey: "second-index",
			logicalObjectKey: "index.jsonl.age",
			machineRemoteId,
		});
		expect(secondIndexResponse.status).toBe(201);
		const secondIndex = (await secondIndexResponse.json()) as ReservationResponse;
		expect(secondIndex.upload.headers["If-Match"]).toBe(`"${firstIndexObject.etag}"`);
		expect(new URL(secondIndex.upload.url).searchParams.get("X-Amz-SignedHeaders")).toContain("if-match");
		const secondIndexObject = await putObject(
			linked.account.id,
			machineRemoteId,
			"index.jsonl.age",
			new Uint8Array([3]),
		);
		expect((await finalize(linked.accessToken, secondIndex.reservationId)).status).toBe(200);
		expect(
			await env.DB.prepare("SELECT current_index_etag FROM machine_remotes WHERE id = ?").bind(machineRemoteId).first(),
		).toEqual({ current_index_etag: secondIndexObject.etag });
	});
});

describe("tenant isolation", () => {
	it("never resolves another account's reservation or object", async () => {
		mockGitHubUsers({
			"github-one": { id: 1, login: "one" },
			"github-two": { id: 2, login: "two" },
		});
		const first = await exchange("github-one");
		const second = await exchange("github-two");
		const machineRemoteId = await createMachine(first.accessToken);
		const bytes = new Uint8Array([1, 2, 3]);
		const reservationResponse = await reserve(first.accessToken, {
			bytes,
			idempotencyKey: "tenant-object",
			logicalObjectKey: "gemini/session.age",
			machineRemoteId,
		});
		const reservation = (await reservationResponse.json()) as ReservationResponse;
		await putObject(first.account.id, machineRemoteId, "gemini/session.age", bytes);

		const otherFinalize = await finalize(second.accessToken, reservation.reservationId);
		expect(otherFinalize.status).toBe(404);
		expect(await otherFinalize.json()).toEqual({ error: "reservation_not_found" });
		expect((await finalize(first.accessToken, reservation.reservationId)).status).toBe(200);

		const otherDownload = await exports.default.fetch(
			jsonRequest("/v1/downloads", { logicalObjectKey: "gemini/session.age", machineRemoteId }, second.accessToken),
		);
		expect(otherDownload.status).toBe(404);
		expect(await otherDownload.json()).toEqual({ error: "object_not_found" });
	});
});
