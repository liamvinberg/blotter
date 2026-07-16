import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import { z } from "zod";
import { PackbatError } from "../core/errors.js";
import { writeManagedRcloneConfig } from "./managed-rclone-config.js";
import { type DropboxToken, renderDropboxRemote } from "./rclone-conf.js";

const DROPBOX_AUTHORIZATION_URL = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
export const DROPBOX_REDIRECT_URI = "http://localhost:53682/";
const AUTHORIZATION_TIMEOUT_MS = 5 * 60 * 1_000;
const CALLBACK_HEADERS = {
	"Cache-Control": "no-store",
	"Content-Type": "text/plain; charset=utf-8",
	"Referrer-Policy": "no-referrer",
} as const;

const tokenResponseSchema = z.object({
	access_token: z.string().min(1),
	expires_in: z.number().int().positive(),
	refresh_token: z.string().min(1),
	token_type: z.string().min(1),
});

interface DropboxAuthorizationOptions {
	appKey: string;
	signal?: AbortSignal;
	timeoutMs?: number;
}

export interface AuthorizeDropboxRemoteOptions extends DropboxAuthorizationOptions {
	configPath: string;
	remoteName?: string;
}

interface CallbackListener {
	code: Promise<string>;
	close: () => Promise<void>;
}

function base64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64url");
}

export function createDropboxCodeVerifier(): string {
	return base64Url(randomBytes(64));
}

export function createDropboxCodeChallenge(verifier: string): string {
	return base64Url(createHash("sha256").update(verifier, "ascii").digest());
}

function createState(): string {
	return base64Url(randomBytes(32));
}

function stateMatches(actual: string | null, expected: string): boolean {
	if (actual === null) return false;
	const actualBytes = Buffer.from(actual);
	const expectedBytes = Buffer.from(expected);
	return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => {
			if (error === undefined) resolve();
			else reject(error);
		});
	});
}

async function listenForCallback(expectedState: string, signal: AbortSignal): Promise<CallbackListener> {
	let resolveCode: (code: string) => void = () => undefined;
	let rejectCode: (error: Error) => void = () => undefined;
	let settled = false;
	const code = new Promise<string>((resolve, reject) => {
		resolveCode = resolve;
		rejectCode = reject;
	});
	const settle = (result: { code: string } | { error: Error }): void => {
		if (settled) return;
		settled = true;
		signal.removeEventListener("abort", onAbort);
		if ("code" in result) resolveCode(result.code);
		else rejectCode(result.error);
	};
	const onAbort = (): void => {
		settle({ error: new PackbatError("Dropbox authorization timed out or was cancelled") });
	};
	const server = createServer((request, response) => {
		const requestUrl = new URL(request.url ?? "/", DROPBOX_REDIRECT_URI);
		if (request.method !== "GET" || requestUrl.pathname !== "/") {
			response.writeHead(404).end();
			return;
		}
		if (!stateMatches(requestUrl.searchParams.get("state"), expectedState)) {
			response.writeHead(400, CALLBACK_HEADERS).end("Authorization response rejected.\n");
			return;
		}
		if (requestUrl.searchParams.has("error")) {
			response.writeHead(400, CALLBACK_HEADERS).end("Dropbox was not connected.\n");
			settle({ error: new PackbatError("Dropbox authorization was not completed") });
			return;
		}
		const authorizationCode = requestUrl.searchParams.get("code");
		if (authorizationCode === null || authorizationCode === "") {
			response.writeHead(400, CALLBACK_HEADERS).end("Authorization response rejected.\n");
			return;
		}
		response.writeHead(200, CALLBACK_HEADERS).end("Dropbox connected. You can close this window.\n");
		settle({ code: authorizationCode });
	});

	signal.addEventListener("abort", onAbort, { once: true });
	try {
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(53_682, "localhost", () => {
				server.removeListener("error", reject);
				resolve();
			});
		});
	} catch {
		signal.removeEventListener("abort", onAbort);
		throw new PackbatError("Dropbox authorization could not start its local callback listener");
	}

	return { code, close: async () => await closeServer(server) };
}

function browserCommand(url: string): { command: string; args: string[] } {
	switch (process.platform) {
		case "darwin":
			return { command: "open", args: [url] };
		case "win32":
			return { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] };
		default:
			return { command: "xdg-open", args: [url] };
	}
}

async function openSystemBrowser(url: string): Promise<void> {
	const { command, args } = browserCommand(url);
	await new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	}).catch(() => {
		throw new PackbatError("Dropbox authorization could not open the system browser");
	});
}

function authorizationSignal(options: DropboxAuthorizationOptions, internal: AbortSignal): AbortSignal {
	const timeout = AbortSignal.timeout(options.timeoutMs ?? AUTHORIZATION_TIMEOUT_MS);
	return options.signal === undefined
		? AbortSignal.any([internal, timeout])
		: AbortSignal.any([internal, timeout, options.signal]);
}

async function exchangeCode(
	code: string,
	verifier: string,
	options: DropboxAuthorizationOptions,
	signal: AbortSignal,
): Promise<DropboxToken> {
	let response: Response;
	try {
		response = await fetch(DROPBOX_TOKEN_URL, {
			body: new URLSearchParams({
				client_id: options.appKey,
				code,
				code_verifier: verifier,
				grant_type: "authorization_code",
				redirect_uri: DROPBOX_REDIRECT_URI,
			}),
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			method: "POST",
			signal,
		});
	} catch {
		throw new PackbatError("Dropbox token exchange failed");
	}
	if (!response.ok) {
		throw new PackbatError(`Dropbox token exchange failed (HTTP ${response.status})`);
	}
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		throw new PackbatError("Dropbox token exchange returned an invalid response");
	}
	const result = tokenResponseSchema.safeParse(body);
	if (!result.success) {
		throw new PackbatError("Dropbox token exchange returned an invalid response");
	}
	return {
		access_token: result.data.access_token,
		token_type: result.data.token_type,
		refresh_token: result.data.refresh_token,
		expiry: new Date(Date.now() + result.data.expires_in * 1_000).toISOString(),
		expires_in: result.data.expires_in,
	};
}

async function requestDropboxToken(options: DropboxAuthorizationOptions): Promise<DropboxToken> {
	if (!/^[A-Za-z0-9_-]+$/u.test(options.appKey)) {
		throw new PackbatError("Dropbox authorization requires a valid app key");
	}
	const verifier = createDropboxCodeVerifier();
	const challenge = createDropboxCodeChallenge(verifier);
	const state = createState();
	const internalAbort = new AbortController();
	const signal = authorizationSignal(options, internalAbort.signal);
	const callback = await listenForCallback(state, signal);
	const authorizationUrl = new URL(DROPBOX_AUTHORIZATION_URL);
	authorizationUrl.search = new URLSearchParams({
		client_id: options.appKey,
		code_challenge: challenge,
		code_challenge_method: "S256",
		redirect_uri: DROPBOX_REDIRECT_URI,
		response_type: "code",
		state,
		token_access_type: "offline",
	}).toString();

	let code: string;
	try {
		await openSystemBrowser(authorizationUrl.toString());
		code = await callback.code;
	} catch (error) {
		internalAbort.abort();
		await callback.code.catch(() => undefined);
		if (error instanceof PackbatError) throw error;
		throw new PackbatError("Dropbox authorization could not open the authorization page");
	} finally {
		await callback.close();
	}
	return await exchangeCode(code, verifier, options, signal);
}

export async function authorizeDropboxRemote(options: AuthorizeDropboxRemoteOptions): Promise<void> {
	const token = await requestDropboxToken(options);
	await writeManagedRcloneConfig(
		options.configPath,
		renderDropboxRemote({ appKey: options.appKey, token }, options.remoteName),
	);
}
