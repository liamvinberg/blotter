import { createFileRoute } from "@tanstack/react-router";
import { ArticleIntro } from "../../components/article-intro";
import { ArticleSection } from "../../components/article-section";
import { CodeBlock } from "../../components/code-block";

export const Route = createFileRoute("/docs/restore-a-session")({
	component: RestoreASessionPage,
});

function RestoreASessionPage() {
	return (
		<>
			<ArticleIntro
				standfirst="Choose an archived session, restore its raw files to the harness store, then use the resume command Packbat prints."
				title="Restore a session"
			/>
			<ArticleSection
				description="Run restore without an id to list this machine's archived sessions. Each line includes the id, harness, machine, file count, and newest source time. Pass --machine to list another archived machine."
				id="find-the-session"
				title="Find the session"
			>
				<CodeBlock lines={[{ text: "$ packbat restore" }]} />
			</ArticleSection>
			<ArticleSection
				description="Pass the full session id or an unambiguous prefix. Packbat refuses a prefix that matches more than one id, and refuses an id that exists in more than one harness."
				id="restore-by-id"
				title="Restore by id"
			>
				<CodeBlock lines={[{ text: "$ packbat restore <id-or-prefix>" }]} />
			</ArticleSection>
			<ArticleSection
				description="The harness adapter maps every archived file back to its exact store location. Packbat creates missing parent directories and restores the original modified time. If a live file is newer, restore stops unless you pass --force."
				id="put-it-back"
				title="Put it back"
			/>
			<ArticleSection
				description="Before decompressing or writing, Packbat hashes the archived bytes and compares them with the checksum in the index. A mismatch stops the restore. Database snapshots get a second content checksum and harness validation before they replace an absent database."
				id="verify-before-writing"
				title="Verify before writing"
			/>
			<ArticleSection
				description="Put the file back and the harness resumes it. Packbat prints the command for that harness after the files are restored. For Claude Code, run it from the original project directory."
				id="resume-the-harness"
				last
				title="Resume the harness"
			>
				<CodeBlock lines={[{ text: "claude --resume <session-id>", tone: "accent" }]} />
			</ArticleSection>
		</>
	);
}
