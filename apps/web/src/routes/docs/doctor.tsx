import { createFileRoute } from "@tanstack/react-router";
import { ArticleIntro } from "../../components/article-intro";
import { ArticleSection } from "../../components/article-section";
import { CodeBlock } from "../../components/code-block";

export const Route = createFileRoute("/docs/doctor")({
	component: DoctorPage,
});

function DoctorPage() {
	return (
		<>
			<ArticleIntro
				standfirst="Prove the schedule is installed and running, the archive is current, and the machine can keep the loop alive."
				title="Doctor"
			/>
			<ArticleSection
				description="Installed checks the scheduler artifact for this platform. It compares the saved command, environment, and schedule with Packbat's expected artifact, then confirms that the Node and Packbat paths still exist."
				id="installed"
				title="Installed"
			/>
			<ArticleSection
				description="Live asks launchd or systemd whether the installed job is loaded and active. On cron, it can only confirm that the Packbat marker is present, so the result is informational rather than proof of execution."
				id="live"
				title="Live"
			/>
			<ArticleSection
				description="Fresh reads the last successful sync stamp. A success is current while it is less than two scheduled intervals old. If the latest run failed, doctor includes that time beside the stale success."
				id="fresh"
				title="Fresh"
			/>
			<ArticleSection
				description="Reconciled walks the live session stores and compares them with the archive tree and index. It reports missing, stale, pending, and orphaned files, plus index drift. New changes inside the normal sync window are pending, not missed."
				id="reconciled"
				title="Reconciled"
			/>
			<ArticleSection
				description="Doctor also checks whether existing stores are readable, the archive root is writable, at least 500 MiB is free, zstd can make a round trip, and each configured off-box destination has a recent success. Stores that Packbat can detect but cannot archive are reported as information."
				id="environment"
				title="Environment"
			/>
			<ArticleSection
				description="Exit 0 means no problem facts. Exit 2 means at least one check found a problem. Exit 1 is reserved for invalid command use or another command failure. Human output gathers every problem under a problems list, and every one includes the action that fixes it. Pass --json for the versioned fact report."
				id="exit-codes-and-json"
				last
				title="Exit codes and JSON"
			>
				<CodeBlock copy lines={[{ text: "Usage: packbat doctor [--json]\n" }]} />
			</ArticleSection>
		</>
	);
}
