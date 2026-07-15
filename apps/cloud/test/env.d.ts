declare namespace Cloudflare {
	interface Env {
		ACCESS_TOKEN_SECRET: string;
		R2_ACCESS_KEY_ID: string;
		R2_ACCOUNT_ID: string;
		R2_BUCKET_NAME: string;
		R2_SECRET_ACCESS_KEY: string;
		TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
	}

	interface GlobalProps {
		mainModule: typeof import("../src/index.js");
	}
}
