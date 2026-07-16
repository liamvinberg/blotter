import { z } from "zod";
import { PackbatError } from "../core/errors.js";

const AUTHORIZE_ACCOUNT_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";
const authorizeResponseSchema = z.object({
	apiInfo: z.object({
		storageApi: z.object({
			s3ApiUrl: z.url(),
		}),
	}),
});

export async function discoverBackblazeS3Endpoint(
	keyId: string,
	applicationKey: string,
	url = AUTHORIZE_ACCOUNT_URL,
): Promise<string> {
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${applicationKey}`).toString("base64")}` },
		});
	} catch {
		throw new PackbatError("Backblaze B2 could not verify the application key");
	}
	if (!response.ok) {
		throw new PackbatError(`Backblaze B2 could not verify the application key (HTTP ${response.status})`);
	}
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new PackbatError("Backblaze B2 returned an invalid account response");
	}
	const result = authorizeResponseSchema.safeParse(body);
	if (!result.success || !result.data.apiInfo.storageApi.s3ApiUrl.startsWith("https://")) {
		throw new PackbatError("Backblaze B2 returned an invalid account response");
	}
	return result.data.apiInfo.storageApi.s3ApiUrl.replace(/\/+$/u, "");
}

export function backblazeRegion(endpoint: string): string {
	const match = new URL(endpoint).hostname.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/u);
	if (match?.[1] === undefined) {
		throw new PackbatError("Backblaze B2 returned an invalid S3 endpoint");
	}
	return match[1];
}
