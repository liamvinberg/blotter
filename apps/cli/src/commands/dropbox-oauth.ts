import { resolveHome } from "../core/home.js";
import { authorizeDropboxRemote } from "../offbox/dropbox-oauth.js";

const USAGE = "Usage: packbat _dropbox-oauth --app-key <public-app-key>\n";

function usageError(): number {
	process.stderr.write(USAGE);
	return 1;
}

export async function runDropboxOAuth(argv: string[]): Promise<number> {
	if (argv.length !== 2 || argv[0] !== "--app-key" || argv[1] === undefined) {
		return usageError();
	}
	await authorizeDropboxRemote({
		appKey: argv[1],
		configPath: resolveHome().rcloneConfPath,
	});
	process.stdout.write("Dropbox authorization complete.\n");
	return 0;
}
