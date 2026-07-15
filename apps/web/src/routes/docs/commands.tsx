import { createFileRoute } from "@tanstack/react-router";
import { ArticleIntro } from "../../components/article-intro";
import { ArticleSection } from "../../components/article-section";
import { CodeBlock } from "../../components/code-block";

export const Route = createFileRoute("/docs/commands")({
	component: CommandsPage,
});

function CommandsPage() {
	return (
		<>
			<ArticleIntro
				standfirst="Set up the archive, run a sync, prove it is healthy, then find, read, or restore a session."
				title="Commands"
			/>
			<ArticleSection
				description="Set up archiving. With a terminal, the wizard detects harnesses, chooses the archive and optional off-box copy, installs the schedule, runs the first sync, then runs doctor. Use --yes for unattended setup, --no-activate to write without activating the schedule, or --uninstall to remove it."
				id="init"
				title="init"
			>
				<CodeBlock
					copy
					lines={[
						{
							text: "Usage: packbat init --yes [--archive-root <abs>] [--offbox skip|remote]\n       [--offbox-remote <rclone-dest>] [--age-recipient <age1…>]\n       [--rclone-config default|managed] [--no-activate]\n       packbat init --uninstall\n",
						},
					]}
				/>
			</ArticleSection>
			<ArticleSection
				description="Run one archive sync now. The installed schedule calls the same command every hour. It reports archived, unchanged, and failed files, and copies encrypted changes off-box when configured."
				id="sync"
				title="sync"
			>
				<CodeBlock copy lines={[{ text: "Usage: packbat sync\n" }]} />
			</ArticleSection>
			<ArticleSection
				description="Prove the schedule is installed and live, the last success is fresh, and nothing has been missed. Environment checks cover the stores, archive, disk, compression, and off-box state. Pass --json for structured output."
				id="doctor"
				title="doctor"
			>
				<CodeBlock copy lines={[{ text: "Usage: packbat doctor [--json]\n" }]} />
			</ArticleSection>
			<ArticleSection
				description="List archived sessions or restore one by id or unambiguous prefix. Use --machine for another source machine, --force only when overwriting a newer live file is intentional, and --from-remote with the identity from the recovery kit for an off-box restore. --remote chooses one configured destination."
				id="restore"
				title="restore"
			>
				<CodeBlock
					copy
					lines={[
						{
							text: "Usage: packbat restore [--machine <name>] [--force] [--from-remote --identity <file> [--remote <destination>]] [<id-or-prefix>]\n",
						},
					]}
				/>
			</ArticleSection>
			<ArticleSection
				description="Print a one-screen health summary for this machine: archive root, schedule state, last run, last success, harness tallies, and off-box state. Pass --json for the report object."
				id="status"
				title="status"
			>
				<CodeBlock copy lines={[{ text: "Usage: packbat status [--json]\n" }]} />
			</ArticleSection>
			<ArticleSection
				description="Find text across archived sessions. Narrow results by harness, machine, project, or time. Pass --json for structured results. Use --rebuild when the local retrieval database needs to be rebuilt from the archive."
				id="search"
				title="search"
			>
				<CodeBlock
					copy
					lines={[
						{
							text: "Usage: packbat search <query> [--harness <id>] [--machine <name>] [--project <path>] [--since <RFC3339>] [--json]\n       packbat search --rebuild [--json]\n",
						},
					]}
				/>
			</ArticleSection>
			<ArticleSection
				description="Read one archived session by unit id or result key. Show reads the raw archive, not the retrieval cache. Pass --json to return the parsed result."
				id="show"
				last
				title="show"
			>
				<CodeBlock copy lines={[{ text: "Usage: packbat show <unit-or-key> [--json]\n" }]} />
			</ArticleSection>
		</>
	);
}
