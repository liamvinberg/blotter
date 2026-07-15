export type DocsSectionLink = {
	id: string;
	title: string;
};

export type DocsPath =
	| "/docs"
	| "/docs/how-it-works"
	| "/docs/commands"
	| "/docs/off-box-copies"
	| "/docs/restore-a-session"
	| "/docs/doctor"
	| "/docs/troubleshooting";

export type DocsPage = {
	path: DocsPath;
	title: string;
	sections: DocsSectionLink[];
};

export type DocsGroup = {
	title: string;
	pages: DocsPage[];
};

export const DOCS_GROUPS: DocsGroup[] = [
	{
		title: "START",
		pages: [
			{
				path: "/docs",
				title: "Get started",
				sections: [
					{ id: "install", title: "Install" },
					{ id: "run-the-wizard", title: "Run the wizard" },
					{ id: "check-the-loop", title: "Check the loop" },
					{ id: "what-happens-next", title: "What happens next" },
				],
			},
			{
				path: "/docs/how-it-works",
				title: "How it works",
				sections: [
					{ id: "walk-the-stores", title: "Walk the stores" },
					{ id: "keep-the-raw-file", title: "Keep the raw file" },
					{ id: "scope-each-machine", title: "Scope each machine" },
					{ id: "derive-the-index", title: "Derive the index" },
					{ id: "catch-up", title: "Catch up" },
				],
			},
		],
	},
	{
		title: "USE PACKBAT",
		pages: [
			{
				path: "/docs/commands",
				title: "Commands",
				sections: [
					{ id: "init", title: "init" },
					{ id: "sync", title: "sync" },
					{ id: "doctor", title: "doctor" },
					{ id: "restore", title: "restore" },
					{ id: "status", title: "status" },
					{ id: "search", title: "search" },
					{ id: "show", title: "show" },
				],
			},
			{
				path: "/docs/off-box-copies",
				title: "Off-box copies",
				sections: [
					{ id: "encrypt-before-upload", title: "Encrypt before upload" },
					{ id: "choose-a-destination", title: "Choose a destination" },
					{ id: "keep-the-recovery-kit", title: "Keep the recovery kit" },
					{ id: "copies-not-syncs", title: "Copies, not syncs" },
					{ id: "restore-from-remote", title: "Restore from remote" },
				],
			},
			{
				path: "/docs/restore-a-session",
				title: "Restore a session",
				sections: [
					{ id: "find-the-session", title: "Find the session" },
					{ id: "restore-by-id", title: "Restore by id" },
					{ id: "put-it-back", title: "Put it back" },
					{ id: "verify-before-writing", title: "Verify before writing" },
					{ id: "resume-the-harness", title: "Resume the harness" },
				],
			},
		],
	},
	{
		title: "KEEP WATCH",
		pages: [
			{
				path: "/docs/doctor",
				title: "Doctor",
				sections: [
					{ id: "installed", title: "Installed" },
					{ id: "live", title: "Live" },
					{ id: "fresh", title: "Fresh" },
					{ id: "reconciled", title: "Reconciled" },
					{ id: "environment", title: "Environment" },
					{ id: "exit-codes-and-json", title: "Exit codes and JSON" },
				],
			},
			{
				path: "/docs/troubleshooting",
				title: "Troubleshooting",
				sections: [
					{ id: "start-with-doctor", title: "Start with doctor" },
					{ id: "schedule", title: "Schedule" },
					{ id: "freshness-and-coverage", title: "Freshness and coverage" },
					{ id: "storage-and-compression", title: "Storage and compression" },
					{ id: "off-box", title: "Off-box" },
					{ id: "unsupported-stores", title: "Unsupported stores" },
				],
			},
		],
	},
];

export const DOCS_PAGES = DOCS_GROUPS.flatMap((group) => group.pages);

export function docsPageForPath(pathname: string): DocsPage | undefined {
	const normalized = pathname.length > 1 ? pathname.replace(/\/$/u, "") : pathname;
	return DOCS_PAGES.find((page) => page.path === normalized);
}
