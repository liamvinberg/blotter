import { PackbatError } from "../core/errors.js";

export function cloudflareR2Endpoint(accountId: string): string {
	if (!/^[a-f0-9]{32}$/u.test(accountId)) {
		throw new PackbatError("Cloudflare account ID must be 32 lowercase hexadecimal characters");
	}
	return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function guidedS3Destination(bucket: string): string {
	const cleanBucket = bucket.replace(/^\/+|\/+$/gu, "");
	if (cleanBucket === "" || cleanBucket.includes("/")) {
		throw new PackbatError("Bucket must be one name without slashes");
	}
	return `packbat:${cleanBucket}/packbat`;
}
