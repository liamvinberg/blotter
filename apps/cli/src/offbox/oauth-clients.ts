import { PackbatError } from "../core/errors.js";

declare const __PACKBAT_DROPBOX_APP_KEY__: string | undefined;
declare const __PACKBAT_GOOGLE_DRIVE_CLIENT_ID__: string | undefined;
declare const __PACKBAT_GOOGLE_DRIVE_CLIENT_SECRET__: string | undefined;

function buildValue(value: string | undefined): string {
	return value?.trim() ?? "";
}

function configuredValue(build: string, environmentName: string): string {
	return build === "" ? buildValue(process.env[environmentName]) : build;
}

export interface GoogleDriveClient {
	clientId: string;
	clientSecret: string;
}

export function googleDriveClient(): GoogleDriveClient {
	const clientId = configuredValue(
		typeof __PACKBAT_GOOGLE_DRIVE_CLIENT_ID__ === "undefined" ? "" : __PACKBAT_GOOGLE_DRIVE_CLIENT_ID__,
		"PACKBAT_GOOGLE_DRIVE_CLIENT_ID",
	);
	const clientSecret = configuredValue(
		typeof __PACKBAT_GOOGLE_DRIVE_CLIENT_SECRET__ === "undefined" ? "" : __PACKBAT_GOOGLE_DRIVE_CLIENT_SECRET__,
		"PACKBAT_GOOGLE_DRIVE_CLIENT_SECRET",
	);
	if (clientId === "" || clientSecret === "") {
		throw new PackbatError("Google Drive is not configured in this Packbat build");
	}
	return { clientId, clientSecret };
}

export function dropboxAppKey(): string {
	const appKey = configuredValue(
		typeof __PACKBAT_DROPBOX_APP_KEY__ === "undefined" ? "" : __PACKBAT_DROPBOX_APP_KEY__,
		"PACKBAT_DROPBOX_APP_KEY",
	);
	if (appKey === "") {
		throw new PackbatError("Dropbox is not configured in this Packbat build");
	}
	return appKey;
}
