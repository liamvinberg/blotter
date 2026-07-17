import { z } from "zod";
import type { Fact } from "./facts.js";

const versionResponseSchema = z.object({
	version: z.string().regex(/^\d+\.\d+\.\d+$/),
});

export async function fetchLatestVersion(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
	const base = env.PACKBAT_REGISTRY_URL?.trim() || "https://registry.npmjs.org";
	try {
		const response = await fetch(`${base}/packbat/latest`, { signal: AbortSignal.timeout(3_000) });
		if (!response.ok) {
			return null;
		}
		const result = versionResponseSchema.safeParse(await response.json());
		return result.success ? result.data.version : null;
	} catch {
		return null;
	}
}

function versionTriple(version: string): [number, number, number] {
	const parts = version.replace(/-.*/, "").split(".");
	const numericPart = (index: number): number => {
		const part = parts[index];
		if (part === undefined || !/^\d+$/.test(part)) {
			return 0;
		}
		const value = Number(part);
		return Number.isFinite(value) ? value : 0;
	};
	return [numericPart(0), numericPart(1), numericPart(2)];
}

export function isVersionBehind(current: string, latest: string): boolean {
	const currentParts = versionTriple(current);
	const latestParts = versionTriple(latest);
	for (let index = 0; index < currentParts.length; index += 1) {
		const currentPart = currentParts[index] ?? 0;
		const latestPart = latestParts[index] ?? 0;
		if (currentPart !== latestPart) {
			return currentPart < latestPart;
		}
	}
	return false;
}

export function versionFact(current: string, latest: string | null): Fact {
	if (latest === null) {
		return {
			id: "version",
			title: "version",
			status: "info",
			detail: `${current}, could not check the latest version`, // DRAFT copy
		};
	}
	if (isVersionBehind(current, latest)) {
		return {
			id: "version",
			title: "version",
			status: "info",
			detail: `${current}, latest is ${latest}, update with npm install --global packbat@latest`, // DRAFT copy
		};
	}
	return {
		id: "version",
		title: "version",
		status: "ok",
		detail: `${current} is the latest`, // DRAFT copy
	};
}
