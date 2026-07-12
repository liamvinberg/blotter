import { hostname } from "node:os";

export function sanitizeMachineName(value: string): string {
	const sanitized = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return sanitized === "" ? "machine" : sanitized;
}

export function defaultMachineName(): string {
	return sanitizeMachineName(hostname().split(".", 1)[0] ?? "");
}
