export function formatMegabytes(bytes: number): string {
	return (bytes / 1_000_000).toFixed(1);
}
