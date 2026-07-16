import { afterEach, describe, expect, test } from "vitest";
import { dropboxAppKey, googleDriveClient } from "./oauth-clients.js";

const originalEnvironment = {
	dropboxAppKey: process.env.PACKBAT_DROPBOX_APP_KEY,
	googleDriveClientId: process.env.PACKBAT_GOOGLE_DRIVE_CLIENT_ID,
	googleDriveClientSecret: process.env.PACKBAT_GOOGLE_DRIVE_CLIENT_SECRET,
};

afterEach(() => {
	for (const [name, value] of [
		["PACKBAT_DROPBOX_APP_KEY", originalEnvironment.dropboxAppKey],
		["PACKBAT_GOOGLE_DRIVE_CLIENT_ID", originalEnvironment.googleDriveClientId],
		["PACKBAT_GOOGLE_DRIVE_CLIENT_SECRET", originalEnvironment.googleDriveClientSecret],
	] as const) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

describe.sequential("OAuth client configuration", () => {
	test("reads Packbat provider clients without echoing them", () => {
		process.env.PACKBAT_DROPBOX_APP_KEY = "synthetic-dropbox-app-key";
		process.env.PACKBAT_GOOGLE_DRIVE_CLIENT_ID = "synthetic-google-client-id";
		process.env.PACKBAT_GOOGLE_DRIVE_CLIENT_SECRET = "synthetic-google-client-secret";

		expect(dropboxAppKey()).toBe("synthetic-dropbox-app-key");
		expect(googleDriveClient()).toEqual({
			clientId: "synthetic-google-client-id",
			clientSecret: "synthetic-google-client-secret",
		});
	});

	test("refuses a build without the Packbat provider clients", () => {
		delete process.env.PACKBAT_DROPBOX_APP_KEY;
		delete process.env.PACKBAT_GOOGLE_DRIVE_CLIENT_ID;
		delete process.env.PACKBAT_GOOGLE_DRIVE_CLIENT_SECRET;

		expect(() => dropboxAppKey()).toThrow("Dropbox is not configured in this Packbat build");
		expect(() => googleDriveClient()).toThrow("Google Drive is not configured in this Packbat build");
	});
});
