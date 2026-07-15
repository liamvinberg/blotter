import { base64Url } from "../base64-url.js";
import { INDEX_OBJECT_KEY, objectKey, userObjectPrefix } from "./object-key.js";
import { signDownload, signUpload } from "./r2-signing.js";

type StorageErrorStatus = 404 | 409 | 413;

export class StorageError extends Error {
	constructor(
		readonly status: StorageErrorStatus,
		readonly code: string,
	) {
		super(code);
	}
}

export interface StorageBindings {
	ARCHIVE_BUCKET: R2Bucket;
	DB: D1Database;
	R2_ACCESS_KEY_ID: string;
	R2_ACCOUNT_ID: string;
	R2_BUCKET_NAME: string;
	R2_SECRET_ACCESS_KEY: string;
}

export interface ReserveUploadInput {
	checksumSha256: string;
	expectedBytes: number;
	expectedIndexEtag?: string | null;
	idempotencyKey: string;
	logicalObjectKey: string;
	machineRemoteId: string;
}

interface ReservationContext {
	checksumSha256: string;
	expectedBytes: number;
	expectedIndexEtag: string | null;
	expiresAt: number;
	id: string;
	idempotencyKey: string;
	logicalObjectKey: string;
	machineRemoteId: string;
	replacedBytes: number;
	replacedEtag: string | null;
	state: "completed" | "expired" | "pending";
	storagePrefix: string;
	userId: string;
}

export type UploadReservationResult =
	| {
			created: boolean;
			reservationId: string;
			state: "pending";
			upload: Awaited<ReturnType<typeof signUpload>>;
	  }
	| { created: false; etag: string; reservationId: string; state: "completed" }
	| { created: false; reservationId: string; state: "expired" };

interface ReservationDiagnosis {
	currentIndexEtag: string | null;
	pendingArchives: number;
	pendingObject: number;
	quotaBytes: number;
	replacedBytes: number;
	reservedBytes: number;
	usedBytes: number;
}

const RESERVATION_LIFETIME_SECONDS = 5 * 60;
const RECONCILIATION_BATCH_SIZE = 100;

function randomOpaqueId(): string {
	return base64Url(crypto.getRandomValues(new Uint8Array(18)));
}

function signingConfig(env: StorageBindings) {
	return {
		accessKeyId: env.R2_ACCESS_KEY_ID,
		accountId: env.R2_ACCOUNT_ID,
		bucketName: env.R2_BUCKET_NAME,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY,
	};
}

function bytesToBase64(value: ArrayBuffer): string {
	const bytes = new Uint8Array(value);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function matchesReservation(object: R2Object, reservation: ReservationContext): boolean {
	return (
		object.size === reservation.expectedBytes &&
		object.checksums.sha256 !== undefined &&
		bytesToBase64(object.checksums.sha256) === reservation.checksumSha256
	);
}

function isConstraintError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("SQLITE_CONSTRAINT");
}

async function getReservation(
	binding: D1Database,
	userId: string,
	where: "id" | "idempotency_key",
	value: string,
): Promise<ReservationContext | null> {
	return await binding
		.prepare(
			`SELECT
				r.checksum_sha256 AS checksumSha256,
				r.expected_bytes AS expectedBytes,
				r.expected_index_etag AS expectedIndexEtag,
				r.expires_at AS expiresAt,
				r.id,
				r.idempotency_key AS idempotencyKey,
				r.logical_object_key AS logicalObjectKey,
				r.machine_remote_id AS machineRemoteId,
				r.replaced_bytes AS replacedBytes,
				r.replaced_etag AS replacedEtag,
				r.state,
				u.storage_prefix AS storagePrefix,
				r.user_id AS userId
			FROM upload_reservations r
			JOIN users u ON u.id = r.user_id
			WHERE r.user_id = ? AND r.${where} = ?`,
		)
		.bind(userId, value)
		.first<ReservationContext>();
}

async function completedEtag(binding: D1Database, reservation: ReservationContext): Promise<string> {
	const row = await binding
		.prepare("SELECT etag FROM object_ledger WHERE user_id = ? AND machine_remote_id = ? AND logical_object_key = ?")
		.bind(reservation.userId, reservation.machineRemoteId, reservation.logicalObjectKey)
		.first<{ etag: string }>();
	if (row === null) {
		throw new Error("completed reservation has no object ledger entry");
	}
	return row.etag;
}

async function pendingResult(
	env: StorageBindings,
	reservation: ReservationContext,
	now: number,
	created: boolean,
): Promise<UploadReservationResult> {
	const expectedEtag = reservation.logicalObjectKey === INDEX_OBJECT_KEY ? reservation.expectedIndexEtag : undefined;
	const conditions = {
		checksumSha256: reservation.checksumSha256,
		contentLength: reservation.expectedBytes,
	};
	return {
		created,
		reservationId: reservation.id,
		state: "pending",
		upload: await signUpload(
			signingConfig(env),
			objectKey(reservation.storagePrefix, reservation.machineRemoteId, reservation.logicalObjectKey),
			expectedEtag === undefined ? conditions : { ...conditions, expectedEtag },
			now,
			reservation.expiresAt,
		),
	};
}

async function reservationResult(
	env: StorageBindings,
	reservation: ReservationContext,
	now: number,
	created: boolean,
): Promise<UploadReservationResult> {
	if (reservation.state === "pending") {
		return await pendingResult(env, reservation, now, created);
	}
	if (reservation.state === "completed") {
		return {
			created: false,
			etag: await completedEtag(env.DB, reservation),
			reservationId: reservation.id,
			state: "completed",
		};
	}
	return { created: false, reservationId: reservation.id, state: "expired" };
}

function sameRequest(reservation: ReservationContext, input: ReserveUploadInput): boolean {
	return (
		reservation.checksumSha256 === input.checksumSha256 &&
		reservation.expectedBytes === input.expectedBytes &&
		reservation.expectedIndexEtag === (input.expectedIndexEtag ?? null) &&
		reservation.logicalObjectKey === input.logicalObjectKey &&
		reservation.machineRemoteId === input.machineRemoteId
	);
}

async function expireReservation(binding: D1Database, reservationId: string, now: number): Promise<void> {
	await binding.batch([
		binding
			.prepare(
				`UPDATE users
				SET
					used_bytes = used_bytes + (
						SELECT replaced_bytes FROM upload_reservations
						WHERE id = ? AND state = 'pending' AND expires_at <= ?
					),
					reserved_bytes = reserved_bytes - (
						SELECT expected_bytes FROM upload_reservations
						WHERE id = ? AND state = 'pending' AND expires_at <= ?
					)
				WHERE EXISTS (
					SELECT 1 FROM upload_reservations
					WHERE id = ? AND user_id = users.id AND state = 'pending' AND expires_at <= ?
				)`,
			)
			.bind(reservationId, now, reservationId, now, reservationId, now),
		binding
			.prepare(
				"UPDATE upload_reservations SET state = 'expired' WHERE id = ? AND state = 'pending' AND expires_at <= ?",
			)
			.bind(reservationId, now),
	]);
}

async function completeReservation(
	binding: D1Database,
	reservation: ReservationContext,
	object: R2Object,
	now: number,
): Promise<boolean> {
	const results = await binding.batch([
		binding
			.prepare(
				`INSERT INTO object_ledger (
					user_id, machine_remote_id, logical_object_key, bytes, etag, last_completed_at
				)
				SELECT r.user_id, r.machine_remote_id, r.logical_object_key, r.expected_bytes, ?, ?
				FROM upload_reservations r
				JOIN machine_remotes m ON m.id = r.machine_remote_id AND m.user_id = r.user_id
				WHERE r.id = ? AND r.state = 'pending'
					AND (r.logical_object_key <> ? OR m.current_index_etag IS r.expected_index_etag)
				ON CONFLICT (machine_remote_id, logical_object_key) DO UPDATE SET
					user_id = excluded.user_id,
					bytes = excluded.bytes,
					etag = excluded.etag,
					last_completed_at = excluded.last_completed_at`,
			)
			.bind(object.etag, now, reservation.id, INDEX_OBJECT_KEY),
		binding
			.prepare(
				`UPDATE users
				SET
					used_bytes = used_bytes + (
						SELECT expected_bytes FROM upload_reservations WHERE id = ?
					),
					reserved_bytes = reserved_bytes - (
						SELECT expected_bytes FROM upload_reservations WHERE id = ?
					)
				WHERE EXISTS (
					SELECT 1
					FROM upload_reservations r
					JOIN machine_remotes m ON m.id = r.machine_remote_id AND m.user_id = r.user_id
					WHERE r.id = ? AND r.user_id = users.id AND r.state = 'pending'
						AND (r.logical_object_key <> ? OR m.current_index_etag IS r.expected_index_etag)
				)`,
			)
			.bind(reservation.id, reservation.id, reservation.id, INDEX_OBJECT_KEY),
		binding
			.prepare(
				`UPDATE upload_reservations
				SET state = 'completed'
				WHERE id = ? AND state = 'pending' AND EXISTS (
					SELECT 1 FROM machine_remotes m
					WHERE m.id = upload_reservations.machine_remote_id
						AND m.user_id = upload_reservations.user_id
						AND (
							upload_reservations.logical_object_key <> ?
							OR m.current_index_etag IS upload_reservations.expected_index_etag
						)
				)`,
			)
			.bind(reservation.id, INDEX_OBJECT_KEY),
		binding
			.prepare(
				`UPDATE machine_remotes
				SET current_index_etag = ?
				WHERE id = ? AND user_id = ? AND EXISTS (
					SELECT 1 FROM upload_reservations r
					WHERE r.id = ? AND r.state = 'completed' AND r.logical_object_key = ?
						AND r.machine_remote_id = machine_remotes.id
						AND r.user_id = machine_remotes.user_id
						AND machine_remotes.current_index_etag IS r.expected_index_etag
				)`,
			)
			.bind(object.etag, reservation.machineRemoteId, reservation.userId, reservation.id, INDEX_OBJECT_KEY),
	]);
	return (results[2]?.meta.changes ?? 0) === 1;
}

async function removeUnexpectedObject(
	bucket: R2Bucket,
	key: string,
	object: R2Object,
	reservation: ReservationContext,
): Promise<void> {
	if (reservation.replacedEtag === null || object.etag !== reservation.replacedEtag) {
		await bucket.delete(key);
	}
}

async function reconcileReservation(env: StorageBindings, reservation: ReservationContext, now: number): Promise<void> {
	const key = objectKey(reservation.storagePrefix, reservation.machineRemoteId, reservation.logicalObjectKey);
	const object = await env.ARCHIVE_BUCKET.head(key);
	if (object !== null && matchesReservation(object, reservation)) {
		if (await completeReservation(env.DB, reservation, object, now)) {
			return;
		}
		const current = await getReservation(env.DB, reservation.userId, "id", reservation.id);
		if (current === null || current.state !== "pending") {
			return;
		}
	}
	if (object !== null) {
		await removeUnexpectedObject(env.ARCHIVE_BUCKET, key, object, reservation);
	}
	await expireReservation(env.DB, reservation.id, now);
}

async function reconcileExpiredReservations(env: StorageBindings, userId: string, now: number): Promise<void> {
	while (true) {
		const expired = await env.DB.prepare(
			"SELECT id FROM upload_reservations WHERE user_id = ? AND state = 'pending' AND expires_at <= ? LIMIT ?",
		)
			.bind(userId, now, RECONCILIATION_BATCH_SIZE)
			.all<{ id: string }>();
		if (expired.results.length === 0) {
			return;
		}
		for (const { id } of expired.results) {
			const reservation = await getReservation(env.DB, userId, "id", id);
			if (reservation !== null && reservation.state === "pending") {
				await reconcileReservation(env, reservation, now);
			}
		}
	}
}

export async function createMachineRemote(binding: D1Database, userId: string, now: number): Promise<string> {
	const id = randomOpaqueId();
	const result = await binding
		.prepare(
			"INSERT INTO machine_remotes (id, user_id, created_at) SELECT ?, id, ? FROM users WHERE id = ? RETURNING id",
		)
		.bind(id, now, userId)
		.first<{ id: string }>();
	if (result === null) {
		throw new StorageError(404, "account_not_found");
	}
	return result.id;
}

async function diagnoseReservation(
	binding: D1Database,
	userId: string,
	input: ReserveUploadInput,
	now: number,
): Promise<never> {
	const diagnosis = await binding
		.prepare(
			`SELECT
				m.current_index_etag AS currentIndexEtag,
				(
					SELECT COUNT(*) FROM upload_reservations r
					WHERE r.user_id = u.id AND r.machine_remote_id = m.id AND r.state = 'pending'
						AND r.expires_at > ? AND r.logical_object_key <> ?
				) AS pendingArchives,
				(
					SELECT COUNT(*) FROM upload_reservations r
					WHERE r.user_id = u.id AND r.machine_remote_id = m.id AND r.state = 'pending'
						AND r.logical_object_key = ?
				) AS pendingObject,
				u.quota_bytes AS quotaBytes,
				COALESCE(o.bytes, 0) AS replacedBytes,
				u.reserved_bytes AS reservedBytes,
				u.used_bytes AS usedBytes
			FROM users u
			JOIN machine_remotes m ON m.user_id = u.id AND m.id = ?
			LEFT JOIN object_ledger o ON o.user_id = u.id AND o.machine_remote_id = m.id
				AND o.logical_object_key = ?
			WHERE u.id = ?`,
		)
		.bind(now, INDEX_OBJECT_KEY, input.logicalObjectKey, input.machineRemoteId, input.logicalObjectKey, userId)
		.first<ReservationDiagnosis>();
	if (diagnosis === null) {
		throw new StorageError(404, "machine_not_found");
	}
	if (diagnosis.pendingObject > 0) {
		throw new StorageError(409, "upload_in_progress");
	}
	if (input.logicalObjectKey === INDEX_OBJECT_KEY) {
		if (diagnosis.currentIndexEtag !== (input.expectedIndexEtag ?? null)) {
			throw new StorageError(409, "index_conflict");
		}
		if (diagnosis.pendingArchives > 0) {
			throw new StorageError(409, "archives_pending");
		}
	}
	if (
		diagnosis.usedBytes + diagnosis.reservedBytes - diagnosis.replacedBytes + input.expectedBytes >
		diagnosis.quotaBytes
	) {
		throw new StorageError(413, "quota_exceeded");
	}
	throw new StorageError(409, "reservation_conflict");
}

export async function reserveUpload(
	env: StorageBindings,
	userId: string,
	input: ReserveUploadInput,
	now: number,
): Promise<UploadReservationResult> {
	await reconcileExpiredReservations(env, userId, now);

	const existing = await getReservation(env.DB, userId, "idempotency_key", input.idempotencyKey);
	if (existing !== null) {
		if (!sameRequest(existing, input)) {
			throw new StorageError(409, "idempotency_conflict");
		}
		return await reservationResult(env, existing, now, false);
	}

	const id = crypto.randomUUID();
	const expiresAt = now + RESERVATION_LIFETIME_SECONDS;
	const isIndex = input.logicalObjectKey === INDEX_OBJECT_KEY ? 1 : 0;
	try {
		const results = await env.DB.batch([
			env.DB.prepare(
				`INSERT INTO upload_reservations (
					id, user_id, machine_remote_id, logical_object_key, expected_bytes, checksum_sha256,
					replaced_bytes, replaced_etag, expected_index_etag, idempotency_key, created_at, expires_at, state
				)
				SELECT ?, u.id, m.id, ?, ?, ?, COALESCE(o.bytes, 0), o.etag, ?, ?, ?, ?, 'pending'
				FROM users u
				JOIN machine_remotes m ON m.user_id = u.id AND m.id = ?
				LEFT JOIN object_ledger o ON o.user_id = u.id AND o.machine_remote_id = m.id
					AND o.logical_object_key = ?
				WHERE u.id = ?
					AND u.used_bytes + u.reserved_bytes - COALESCE(o.bytes, 0) + ? <= u.quota_bytes
					AND (? = 0 OR (
						m.current_index_etag IS ?
						AND NOT EXISTS (
							SELECT 1 FROM upload_reservations pending
							WHERE pending.user_id = u.id AND pending.machine_remote_id = m.id
								AND pending.state = 'pending' AND pending.expires_at > ?
								AND pending.logical_object_key <> ?
						)
					))`,
			).bind(
				id,
				input.logicalObjectKey,
				input.expectedBytes,
				input.checksumSha256,
				input.expectedIndexEtag ?? null,
				input.idempotencyKey,
				now,
				expiresAt,
				input.machineRemoteId,
				input.logicalObjectKey,
				userId,
				input.expectedBytes,
				isIndex,
				input.expectedIndexEtag ?? null,
				now,
				INDEX_OBJECT_KEY,
			),
			env.DB.prepare(
				`UPDATE users
				SET
					used_bytes = used_bytes - (
						SELECT replaced_bytes FROM upload_reservations WHERE id = ?
					),
					reserved_bytes = reserved_bytes + ?
				WHERE id = ? AND EXISTS (
					SELECT 1 FROM upload_reservations
					WHERE id = ? AND user_id = users.id AND state = 'pending'
				)`,
			).bind(id, input.expectedBytes, userId, id),
		]);
		if ((results[0]?.meta.changes ?? 0) !== 1) {
			return await diagnoseReservation(env.DB, userId, input, now);
		}
	} catch (error) {
		const raced = await getReservation(env.DB, userId, "idempotency_key", input.idempotencyKey);
		if (raced !== null) {
			if (!sameRequest(raced, input)) {
				throw new StorageError(409, "idempotency_conflict");
			}
			return await reservationResult(env, raced, now, false);
		}
		if (!isConstraintError(error)) {
			throw error;
		}
		return await diagnoseReservation(env.DB, userId, input, now);
	}

	const reservation = await getReservation(env.DB, userId, "id", id);
	if (reservation === null) {
		throw new Error("reservation was not available after creation");
	}
	return await pendingResult(env, reservation, now, true);
}

export async function finalizeUpload(
	env: StorageBindings,
	userId: string,
	reservationId: string,
	now: number,
): Promise<{ etag: string }> {
	const reservation = await getReservation(env.DB, userId, "id", reservationId);
	if (reservation === null) {
		throw new StorageError(404, "reservation_not_found");
	}
	if (reservation.state === "completed") {
		return { etag: await completedEtag(env.DB, reservation) };
	}
	if (reservation.state === "expired") {
		throw new StorageError(409, "reservation_expired");
	}

	const key = objectKey(reservation.storagePrefix, reservation.machineRemoteId, reservation.logicalObjectKey);
	const object = await env.ARCHIVE_BUCKET.head(key);
	if (object === null) {
		if (reservation.expiresAt <= now) {
			await expireReservation(env.DB, reservation.id, now);
			throw new StorageError(409, "reservation_expired");
		}
		throw new StorageError(409, "upload_missing");
	}
	if (!matchesReservation(object, reservation)) {
		await removeUnexpectedObject(env.ARCHIVE_BUCKET, key, object, reservation);
		if (reservation.expiresAt <= now) {
			await expireReservation(env.DB, reservation.id, now);
			throw new StorageError(409, "reservation_expired");
		}
		throw new StorageError(409, "upload_mismatch");
	}
	if (!(await completeReservation(env.DB, reservation, object, now))) {
		const current = await getReservation(env.DB, userId, "id", reservation.id);
		if (current?.state === "completed") {
			return { etag: await completedEtag(env.DB, current) };
		}
		throw new StorageError(409, "index_conflict");
	}
	return { etag: object.etag };
}

export async function createDownload(
	env: StorageBindings,
	userId: string,
	machineRemoteId: string,
	logicalObjectKey: string,
	now: number,
): Promise<{ expiresAt: number; url: string }> {
	const object = await env.DB.prepare(
		`SELECT u.storage_prefix AS storagePrefix
		FROM object_ledger o
		JOIN users u ON u.id = o.user_id
		WHERE o.user_id = ? AND o.machine_remote_id = ? AND o.logical_object_key = ?`,
	)
		.bind(userId, machineRemoteId, logicalObjectKey)
		.first<{ storagePrefix: string }>();
	if (object === null) {
		throw new StorageError(404, "object_not_found");
	}
	return await signDownload(
		signingConfig(env),
		objectKey(object.storagePrefix, machineRemoteId, logicalObjectKey),
		now,
	);
}

export async function deleteAccountData(env: StorageBindings, userId: string): Promise<void> {
	const account = await env.DB.prepare("SELECT storage_prefix AS storagePrefix FROM users WHERE id = ?")
		.bind(userId)
		.first<{ storagePrefix: string }>();
	if (account === null) {
		return;
	}
	const prefix = userObjectPrefix(account.storagePrefix);
	while (true) {
		const listed = await env.ARCHIVE_BUCKET.list({ limit: 1_000, prefix });
		if (listed.objects.length === 0) {
			break;
		}
		await env.ARCHIVE_BUCKET.delete(listed.objects.map(({ key }) => key));
	}
	await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}
