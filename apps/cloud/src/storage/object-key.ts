export const INDEX_OBJECT_KEY = "index.jsonl.age";

const MAX_LOGICAL_OBJECT_KEY_BYTES = 1_024;

function containsControlCharacter(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0);
		if (codePoint !== undefined && (codePoint < 32 || codePoint === 127)) {
			return true;
		}
	}
	return false;
}

export function isLogicalObjectKey(value: string): boolean {
	if (
		value.length === 0 ||
		new TextEncoder().encode(value).byteLength > MAX_LOGICAL_OBJECT_KEY_BYTES ||
		value.startsWith("/") ||
		value.endsWith("/") ||
		value.includes("\\") ||
		containsControlCharacter(value) ||
		!value.endsWith(".age")
	) {
		return false;
	}

	const segments = value.split("/");
	return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function objectKey(storagePrefix: string, machineRemoteId: string, logicalObjectKey: string): string {
	return `users/${storagePrefix}/machines/${machineRemoteId}/${logicalObjectKey}`;
}

export function userObjectPrefix(storagePrefix: string): string {
	return `users/${storagePrefix}/`;
}
