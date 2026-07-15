import { createFileRoute } from "@tanstack/react-router";
import { ArticleIntro } from "../../components/article-intro";
import { ArticleSection } from "../../components/article-section";
import { CodeBlock } from "../../components/code-block";

export const Route = createFileRoute("/docs/troubleshooting")({
	component: TroubleshootingPage,
});

function TroubleshootingPage() {
	return (
		<>
			<ArticleIntro
				standfirst="Start with doctor. It names the failed fact, shows what it found, and prints the command or action that fixes it."
				title="Troubleshooting"
			/>
			<ArticleSection
				description="Run doctor before changing config or scheduler files by hand. Fix the listed problems, then run it again. Use --json when another tool needs the same facts without terminal formatting."
				id="start-with-doctor"
				title="Start with doctor"
			>
				<CodeBlock lines={[{ text: "$ packbat doctor" }]} />
			</ArticleSection>
			<ArticleSection
				description="If installed fails, run packbat init again. If live fails, run init again and inspect the scheduler. Init rewrites the expected artifact with the current Node path, Packbat entry point, and environment."
				id="schedule"
				title="Schedule"
			/>
			<ArticleSection
				description="If fresh or reconciled fails, run packbat sync. Inspect the log when freshness still fails. Claude Code removes sessions older than 30 days by default while the harness starts, so repair sync before that retention window closes."
				id="freshness-and-coverage"
				title="Freshness and coverage"
			>
				<CodeBlock lines={[{ text: "$ packbat sync" }]} />
			</ArticleSection>
			<ArticleSection
				description="Fix read access for a listed source store, or write access for the archive root. Free at least 500 MiB when disk headroom fails. If compression fails, use the supported Node.js version, 22.16 or newer."
				id="storage-and-compression"
				title="Storage and compression"
			/>
			<ArticleSection
				description="If an off-box fact fails, run packbat sync and inspect the log for that destination. Confirm rclone can reach the remote with the configured mode. A failed off-box copy does not turn the plaintext archive into remote state, only encrypted objects leave the machine."
				id="off-box"
				title="Off-box"
			/>
			<ArticleSection
				description="Init can report a store as found but not yet supported. That means detection worked, but Packbat has no shipped adapter for its session format. The store is not archived until support lands."
				id="unsupported-stores"
				last
				title="Unsupported stores"
			>
				<CodeBlock lines={[{ text: "found but not yet supported", tone: "muted" }]} />
			</ArticleSection>
		</>
	);
}
