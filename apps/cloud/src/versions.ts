import { z } from "zod";

const DEFAULT_NPM_REGISTRY_URL = "https://registry.npmjs.org";
const LATEST_VERSION_TTL_MS = 60 * 60 * 1_000;
const latestVersionSchema = z.looseObject({ version: z.string().regex(/^\d+\.\d+\.\d+$/u) });

interface VersionBindings {
	NPM_REGISTRY_URL?: string;
}

const latestVersionByRegistry = new Map<string, { expiresAt: number; value: Promise<string | null> }>();

function versionParts(version: string): [number, number, number] {
	const parts = version.split("-", 1)[0]?.split(".") ?? [];
	return [0, 1, 2].map((index) => {
		const part = parts[index];
		return part !== undefined && /^\d+$/u.test(part) ? Number(part) : 0;
	}) as [number, number, number];
}

export function compareVersions(a: string, b: string): -1 | 0 | 1 {
	const left = versionParts(a);
	const right = versionParts(b);
	for (const index of [0, 1, 2] as const) {
		if (left[index] < right[index]) return -1;
		if (left[index] > right[index]) return 1;
	}
	return 0;
}

async function fetchLatestVersion(registryBaseUrl: string): Promise<string | null> {
	try {
		const response = await fetch(`${registryBaseUrl}/packbat/latest`, { signal: AbortSignal.timeout(2_000) });
		if (!response.ok) return null;
		const result = latestVersionSchema.safeParse(await response.json());
		return result.success ? result.data.version : null;
	} catch {
		return null;
	}
}

export async function latestCliVersion(env: VersionBindings): Promise<string | null> {
	const registryBaseUrl = env.NPM_REGISTRY_URL ?? DEFAULT_NPM_REGISTRY_URL;
	const now = Date.now();
	const memoized = latestVersionByRegistry.get(registryBaseUrl);
	if (memoized !== undefined && memoized.expiresAt > now) {
		return await memoized.value;
	}
	const value = fetchLatestVersion(registryBaseUrl);
	latestVersionByRegistry.set(registryBaseUrl, { expiresAt: now + LATEST_VERSION_TTL_MS, value });
	return await value;
}
