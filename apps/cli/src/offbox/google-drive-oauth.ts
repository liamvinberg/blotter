import { spawn } from "node:child_process";
import { chmod } from "node:fs/promises";
import { z } from "zod";
import { PackbatError } from "../core/errors.js";
import { ensurePrivateManagedRcloneConfig } from "./managed-rclone-config.js";
import { discoverRclone } from "./rclone.js";

const headlessResponseSchema = z.object({
	State: z.string().startsWith("*oauth-authorize,"),
	Option: z.object({ Help: z.string() }),
	Error: z.string(),
});
const googleTokenSchema = z.object({
	access_token: z.string().min(1),
	token_type: z.string().min(1),
	refresh_token: z.string().min(1),
	expiry: z.string().min(1),
});

export interface GoogleDriveClientOptions {
	clientId: string;
	clientSecret: string;
	configPath: string;
	remoteName: string;
}

export interface GoogleDriveHeadlessContinuation {
	browserCommand: string;
	complete: (token: string) => Promise<void>;
}

async function runRcloneConfig(
	options: GoogleDriveClientOptions,
	configurationArguments: string[],
	stdio: "capture" | "inherit",
): Promise<string> {
	const executable = await discoverRclone();
	await ensurePrivateManagedRcloneConfig(options.configPath);
	const output = await new Promise<string>((resolve, reject) => {
		const child = spawn(
			executable,
			[
				"config",
				"create",
				options.remoteName,
				"drive",
				"client_id",
				options.clientId,
				"client_secret",
				options.clientSecret,
				"scope",
				"drive.file",
				...configurationArguments,
				"--obscure",
				"--config",
				options.configPath,
			],
			{ env: process.env, stdio: stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"] },
		);
		let stdout = "";
		if (stdio === "capture") {
			child.stdout?.on("data", (chunk: Buffer) => {
				stdout += chunk.toString("utf8");
			});
			child.stderr?.resume();
		}
		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) resolve(stdout);
			else reject(new PackbatError("Google Drive authorization was not completed"));
		});
	});
	await chmod(options.configPath, 0o600);
	return output;
}

export async function authorizeGoogleDriveInBrowser(options: GoogleDriveClientOptions): Promise<void> {
	await runRcloneConfig(
		options,
		["config_is_local", "true", "config_change_team_drive", "false", "--no-output"],
		"inherit",
	);
}

export async function beginGoogleDriveHeadlessAuthorization(
	options: GoogleDriveClientOptions,
): Promise<GoogleDriveHeadlessContinuation> {
	const output = await runRcloneConfig(options, ["config_is_local", "false", "--non-interactive"], "capture");
	let raw: unknown;
	try {
		raw = JSON.parse(output);
	} catch {
		throw new PackbatError("Google Drive returned an invalid headless continuation");
	}
	const continuation = headlessResponseSchema.safeParse(raw);
	if (!continuation.success || continuation.data.Error !== "") {
		throw new PackbatError("Google Drive returned an invalid headless continuation");
	}
	const encodedConfiguration = continuation.data.Option.Help.match(/rclone authorize "drive" "([A-Za-z0-9_-]+)"/u)?.[1];
	if (encodedConfiguration === undefined) {
		throw new PackbatError("Google Drive returned an invalid headless continuation");
	}
	return {
		browserCommand: `rclone authorize drive ${encodedConfiguration}`,
		complete: async (token) => {
			let rawToken: unknown;
			try {
				rawToken = JSON.parse(token);
			} catch {
				throw new PackbatError("Google Drive authorization result is invalid");
			}
			const parsedToken = googleTokenSchema.safeParse(rawToken);
			if (!parsedToken.success) throw new PackbatError("Google Drive authorization result is invalid");
			await runRcloneConfig(
				options,
				[
					"token",
					JSON.stringify(parsedToken.data),
					"config_refresh_token",
					"false",
					"config_change_team_drive",
					"false",
					"--non-interactive",
					"--no-output",
				],
				"capture",
			);
		},
	};
}
