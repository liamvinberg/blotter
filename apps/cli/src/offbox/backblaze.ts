import { z } from "zod";
import { PackbatError } from "../core/errors.js";

const AUTHORIZE_ACCOUNT_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";
const authorizeResponseSchema = z.object({
	accountId: z.string().min(1),
	authorizationToken: z.string().min(1),
	apiInfo: z.object({
		storageApi: z.object({
			apiUrl: z.url(),
			s3ApiUrl: z.url(),
			allowed: z.object({
				buckets: z.array(z.object({ id: z.string().min(1), name: z.string().nullable() })).nullable(),
				capabilities: z.array(z.string()),
			}),
		}),
	}),
});
const listBucketsResponseSchema = z.object({
	buckets: z.array(z.object({ bucketName: z.string().min(1), bucketType: z.string() })),
});

export interface BackblazeStorage {
	endpoint: string;
	region: string;
	buckets: readonly string[];
}

async function responseJson(response: Response, message: string): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		throw new PackbatError(message);
	}
}

export async function discoverBackblazeStorage(keyId: string, applicationKey: string): Promise<BackblazeStorage> {
	let response: Response;
	try {
		response = await fetch(AUTHORIZE_ACCOUNT_URL, {
			headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${applicationKey}`).toString("base64")}` },
		});
	} catch {
		throw new PackbatError("Backblaze B2 could not verify the application key");
	}
	if (!response.ok) {
		throw new PackbatError(`Backblaze B2 could not verify the application key (HTTP ${response.status})`);
	}
	const body = await responseJson(response, "Backblaze B2 returned an invalid account response");
	const result = authorizeResponseSchema.safeParse(body);
	if (!result.success || !result.data.apiInfo.storageApi.s3ApiUrl.startsWith("https://")) {
		throw new PackbatError("Backblaze B2 returned an invalid account response");
	}
	const storage = result.data.apiInfo.storageApi;
	const restrictedBuckets = storage.allowed.buckets?.flatMap((bucket) => (bucket.name === null ? [] : [bucket.name]));
	let buckets = restrictedBuckets ?? [];
	if (storage.allowed.buckets === null) {
		if (!storage.allowed.capabilities.includes("listBuckets")) {
			throw new PackbatError("Backblaze B2 application key must be restricted to a bucket or allow bucket listing");
		}
		let listResponse: Response;
		try {
			listResponse = await fetch(`${storage.apiUrl.replace(/\/+$/u, "")}/b2api/v4/b2_list_buckets`, {
				body: JSON.stringify({ accountId: result.data.accountId, bucketTypes: ["allPrivate"] }),
				headers: {
					Authorization: result.data.authorizationToken,
					"Content-Type": "application/json",
				},
				method: "POST",
			});
		} catch {
			throw new PackbatError("Backblaze B2 could not list buckets");
		}
		if (!listResponse.ok) {
			throw new PackbatError(`Backblaze B2 could not list buckets (HTTP ${listResponse.status})`);
		}
		const listBody = await responseJson(listResponse, "Backblaze B2 returned an invalid bucket response");
		const list = listBucketsResponseSchema.safeParse(listBody);
		if (!list.success) throw new PackbatError("Backblaze B2 returned an invalid bucket response");
		buckets = list.data.buckets
			.filter((bucket) => bucket.bucketType === "allPrivate")
			.map((bucket) => bucket.bucketName);
	}
	if (buckets.length === 0) {
		throw new PackbatError("Backblaze B2 application key has no private bucket available");
	}
	const endpoint = storage.s3ApiUrl.replace(/\/+$/u, "");
	return { endpoint, region: backblazeRegion(endpoint), buckets: [...new Set(buckets)].sort() };
}

export function backblazeRegion(endpoint: string): string {
	const match = new URL(endpoint).hostname.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/u);
	if (match?.[1] === undefined) {
		throw new PackbatError("Backblaze B2 returned an invalid S3 endpoint");
	}
	return match[1];
}
