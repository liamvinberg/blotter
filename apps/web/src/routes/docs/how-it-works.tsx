import { createFileRoute } from "@tanstack/react-router";
import { ArticleIntro } from "../../components/article-intro";
import { ArticleSection } from "../../components/article-section";
import { CodeBlock } from "../../components/code-block";

export const Route = createFileRoute("/docs/how-it-works")({
	component: HowItWorksPage,
});

function HowItWorksPage() {
	return (
		<>
			<ArticleIntro
				standfirst="Every sync finds new and changed session files, compresses their bytes verbatim, and keeps them in the archive you chose."
				title="How it works"
			/>
			<ArticleSection
				description="The hourly job walks each supported session store and reads file metadata. A missing file is new. A source with a newer modified time, or a changed size at the same time, is ready to archive. Everything else stays untouched."
				id="walk-the-stores"
				title="Walk the stores"
			>
				<CodeBlock lines={[{ text: "$ packbat sync" }]} />
			</ArticleSection>
			<ArticleSection
				description="Packbat reads the source bytes, compresses them with zstd, and records their checksum. It does not normalize or redact the session. A newer source is appended as a superseding archive record, and existing archive objects are never rewritten."
				id="keep-the-raw-file"
				title="Keep the raw file"
			/>
			<ArticleSection
				description="Each machine writes beneath its own hostname-safe name. That keeps two computers with the same harness and session id from colliding, and lets restore choose a source machine explicitly."
				id="scope-each-machine"
				title="Scope each machine"
			/>
			<ArticleSection
				description="The JSONL index points from a session id to archived files, checksums, source times, and harness metadata. It is derived data beside the raw archive. The session files remain the durable record."
				id="derive-the-index"
				title="Derive the index"
			/>
			<ArticleSection
				description="The schedule runs hourly at :03. It also runs at login or wake, so a sleeping laptop catches up without waiting for the next hour. If one sync is already running, another exits without competing for the archive."
				id="catch-up"
				last
				title="Catch up"
			/>
		</>
	);
}
