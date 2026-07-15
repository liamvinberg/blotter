import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
	const migrations = await readD1Migrations(fileURLToPath(new URL("./drizzle", import.meta.url)));
	return {
		plugins: [
			cloudflareTest({
				wrangler: { configPath: "./wrangler.jsonc" },
				miniflare: {
					bindings: {
						ACCESS_TOKEN_SECRET: "packbat-test-signing-secret-32-bytes-minimum",
						R2_ACCESS_KEY_ID: "test-r2-access-key",
						R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
						R2_BUCKET_NAME: "packbat-cloud-archives",
						R2_SECRET_ACCESS_KEY: "test-r2-secret-access-key",
						TEST_MIGRATIONS: migrations,
					},
				},
			}),
		],
		test: {
			include: ["src/**/*.test.ts", "test/**/*.test.ts"],
			setupFiles: ["./test/setup.ts"],
		},
	};
});
