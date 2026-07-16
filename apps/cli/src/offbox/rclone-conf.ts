export interface S3RemoteInput {
	endpoint?: string;
	accessKeyId: string;
	secretAccessKey: string;
	provider?: "AWS" | "Cloudflare" | "Other";
	region?: string;
	acl?: "private";
	noCheckBucket?: boolean;
}

export interface SftpRemoteInput {
	host: string;
	user: string;
	port?: number;
	keyFile?: string;
}

export interface DropboxToken {
	access_token: string;
	token_type: string;
	refresh_token: string;
	expiry: string;
	expires_in: number;
}

export interface DropboxRemoteInput {
	appKey: string;
	token: DropboxToken;
}

function renderRemote(lines: string[]): string {
	return `${lines.join("\n")}\n`;
}

export function managedRcloneRemoteName(index: number): string {
	if (!Number.isInteger(index) || index < 0) {
		throw new Error("managed remote index must be a non-negative integer"); // DRAFT copy
	}
	return index === 0 ? "packbat" : `packbat-${index + 1}`;
}

export function renderS3Remote(input: S3RemoteInput, remoteName = managedRcloneRemoteName(0)): string {
	return renderRemote([
		`[${remoteName}]`,
		"type = s3",
		`provider = ${input.provider ?? "Other"}`,
		`access_key_id = ${input.accessKeyId}`,
		`secret_access_key = ${input.secretAccessKey}`,
		...(input.endpoint === undefined ? [] : [`endpoint = ${input.endpoint}`]),
		...(input.region === undefined ? [] : [`region = ${input.region}`]),
		...(input.acl === undefined ? [] : [`acl = ${input.acl}`]),
		...(input.noCheckBucket === true ? ["no_check_bucket = true"] : []),
	]);
}

export function renderSftpRemote(input: SftpRemoteInput, remoteName = managedRcloneRemoteName(0)): string {
	return renderRemote([
		`[${remoteName}]`,
		"type = sftp",
		`host = ${input.host}`,
		`user = ${input.user}`,
		...(input.port === undefined ? [] : [`port = ${input.port}`]),
		...(input.keyFile === undefined ? [] : [`key_file = ${input.keyFile}`]),
	]);
}

export function renderDropboxRemote(input: DropboxRemoteInput, remoteName = managedRcloneRemoteName(0)): string {
	if (!/^[A-Za-z0-9_-]+$/u.test(input.appKey)) {
		throw new Error("Dropbox app key is invalid");
	}
	return renderRemote([
		`[${remoteName}]`,
		"type = dropbox",
		`client_id = ${input.appKey}`,
		`token = ${JSON.stringify(input.token)}`,
	]);
}
