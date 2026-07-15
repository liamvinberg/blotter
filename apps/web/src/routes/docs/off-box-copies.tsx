import { createFileRoute } from "@tanstack/react-router";
import { ArticleIntro } from "../../components/article-intro";
import { ArticleSection } from "../../components/article-section";
import { CodeBlock } from "../../components/code-block";

export const Route = createFileRoute("/docs/off-box-copies")({
	component: OffBoxCopiesPage,
});

function OffBoxCopiesPage() {
	return (
		<>
			<ArticleIntro
				standfirst="Keep an encrypted copy of the archive on a remote you own, with the only key held in your recovery kit."
				title="Off-box copies"
			/>
			<ArticleSection
				description="Packbat encrypts each changed archive object and the index to an age public recipient in a local outbox. Only the resulting ciphertext is handed to rclone. The private identity is not kept in the archive config."
				id="encrypt-before-upload"
				title="Encrypt before upload"
			/>
			<ArticleSection
				description="The wizard can configure an S3-compatible store, SFTP, or any rclone destination. S3-compatible and SFTP remotes can use a Packbat-managed rclone config. A custom destination can use your default rclone config instead."
				id="choose-a-destination"
				title="Choose a destination"
			>
				<CodeBlock
					lines={[
						{ text: "S3-compatible", tone: "ok" },
						{ text: "SFTP", tone: "ok" },
						{ text: "Any rclone destination", tone: "ok" },
					]}
				/>
			</ArticleSection>
			<ArticleSection
				description="The recovery kit holds the age identity, the recipient, the remote location, and fresh-machine restore commands. It holds the only key. Keep a copy somewhere safe off this machine, such as a password manager. If every copy is lost, nobody can recover the remote archive."
				id="keep-the-recovery-kit"
				title="Keep the recovery kit"
			/>
			<ArticleSection
				description="Uploads are copies, never syncs. Packbat sends new or changed encrypted objects and an encrypted index. It does not ask rclone to delete remote files, so a local removal cannot remove the off-box copy."
				id="copies-not-syncs"
				title="Copies, not syncs"
			/>
			<ArticleSection
				description="Restore downloads and decrypts the remote index first. Once you choose a session, Packbat downloads only that session's objects, verifies them, then restores them to the harness store."
				id="restore-from-remote"
				last
				title="Restore from remote"
			>
				<CodeBlock
					copy
					lines={[
						{
							text: "packbat restore --from-remote --identity <kit-file> <unit> --machine <source-machine>",
						},
					]}
				/>
			</ArticleSection>
		</>
	);
}
