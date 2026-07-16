import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { managedRcloneRemoteName, renderDropboxRemote, renderS3Remote, renderSftpRemote } from "./rclone-conf.js";

describe("managed rclone configuration", () => {
	test("keeps the original section and numbers additional managed remotes", () => {
		expect([0, 1, 2].map(managedRcloneRemoteName)).toEqual(["packbat", "packbat-2", "packbat-3"]);
		expect(
			renderS3Remote(
				{
					endpoint: "https://objects.example.com",
					accessKeyId: "access-key-id",
					secretAccessKey: "secret-access-key",
				},
				managedRcloneRemoteName(1),
			),
		).toContain("[packbat-2]");
	});
	test("renders an S3-compatible remote with credentials inline", () => {
		expect(
			renderS3Remote({
				endpoint: "https://objects.example.com",
				accessKeyId: "access-key-id",
				secretAccessKey: "secret-access-key",
				region: "eu-north-1",
			}),
		).toBe(`[packbat]
type = s3
provider = Other
access_key_id = access-key-id
secret_access_key = secret-access-key
endpoint = https://objects.example.com
region = eu-north-1
`);
		expect(
			renderS3Remote({
				endpoint: "https://objects.example.com",
				accessKeyId: "access-key-id",
				secretAccessKey: "secret-access-key",
			}),
		).toBe(`[packbat]
type = s3
provider = Other
access_key_id = access-key-id
secret_access_key = secret-access-key
endpoint = https://objects.example.com
`);
	});

	test("renders an SFTP remote with optional connection fields", () => {
		expect(
			renderSftpRemote({
				host: "archive.example.com",
				user: "backup",
				port: 2222,
				keyFile: "/home/liam/.ssh/archive-key",
			}),
		).toBe(`[packbat]
type = sftp
host = archive.example.com
user = backup
port = 2222
key_file = /home/liam/.ssh/archive-key
`);
		expect(renderSftpRemote({ host: "archive.example.com", user: "backup" })).toBe(`[packbat]
type = sftp
host = archive.example.com
user = backup
`);
	});

	test("renders a Dropbox public client with its refreshable token and no app secret", () => {
		const accessToken = randomBytes(24).toString("base64url");
		const refreshToken = randomBytes(24).toString("base64url");
		const rendered = renderDropboxRemote({
			appKey: "public-app-key",
			token: {
				access_token: accessToken,
				token_type: "bearer",
				refresh_token: refreshToken,
				expiry: "2026-07-16T12:00:00.000Z",
				expires_in: 14_400,
			},
		});

		expect(rendered).toContain("[packbat]\ntype = dropbox\nclient_id = public-app-key\n");
		expect(rendered).toContain(`"access_token":"${accessToken}"`);
		expect(rendered).toContain(`"refresh_token":"${refreshToken}"`);
		expect(rendered).not.toContain("client_secret");
	});
});
