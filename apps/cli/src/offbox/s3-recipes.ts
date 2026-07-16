import { PackbatError } from "../core/errors.js";

export interface R2Credentials {
	accessKeyId: string;
	secretAccessKey: string;
}

export function cloudflareR2Endpoint(accountId: string): string {
	if (!/^[a-f0-9]{32}$/u.test(accountId)) {
		throw new PackbatError("Cloudflare account ID must be 32 lowercase hexadecimal characters");
	}
	return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function parseR2Token(value: string): R2Credentials {
	const separator = value.indexOf(":");
	const accessKeyId = value.slice(0, separator).trim();
	const secretAccessKey = value.slice(separator + 1).trim();
	if (separator < 1 || accessKeyId === "" || secretAccessKey === "") {
		throw new PackbatError("R2 token must be Access Key ID followed by a colon and Secret Access Key");
	}
	return { accessKeyId, secretAccessKey };
}

export function guidedS3Destination(bucket: string): string {
	const cleanBucket = bucket.replace(/^\/+|\/+$/gu, "");
	if (cleanBucket === "" || cleanBucket.includes("/")) {
		throw new PackbatError("Bucket must be one name without slashes");
	}
	return `packbat:${cleanBucket}/packbat`;
}
