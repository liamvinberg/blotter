import { defineConfig } from "tsup";

const providerClients = {
	dropboxAppKey: process.env.PACKBAT_DROPBOX_APP_KEY ?? "",
	googleDriveClientId: process.env.PACKBAT_GOOGLE_DRIVE_CLIENT_ID ?? "",
	googleDriveClientSecret: process.env.PACKBAT_GOOGLE_DRIVE_CLIENT_SECRET ?? "",
};

if (process.env.PACKBAT_RELEASE_BUILD === "1" && Object.values(providerClients).some((value) => value.trim() === "")) {
	throw new Error("release build requires the Packbat Google Drive and Dropbox client values");
}

export default defineConfig({
	entry: ["src/main.ts"],
	format: "esm",
	target: "node22",
	clean: true,
	sourcemap: false,
	dts: false,
	define: {
		__PACKBAT_DROPBOX_APP_KEY__: JSON.stringify(providerClients.dropboxAppKey),
		__PACKBAT_GOOGLE_DRIVE_CLIENT_ID__: JSON.stringify(providerClients.googleDriveClientId),
		__PACKBAT_GOOGLE_DRIVE_CLIENT_SECRET__: JSON.stringify(providerClients.googleDriveClientSecret),
	},
});
