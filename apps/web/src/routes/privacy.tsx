import { createFileRoute } from "@tanstack/react-router";
import { ArticleIntro } from "../components/article-intro";
import { ArticleSection } from "../components/article-section";
import { SiteFooter } from "../sections/site-footer";
import { SiteNav } from "../sections/site-nav";

const policyLinkClass = "text-accent underline decoration-hairline underline-offset-[3px]";

export const Route = createFileRoute("/privacy")({
	component: PrivacyPage,
	head: () => ({
		meta: [
			{ title: "Privacy policy | Packbat" },
			{
				name: "description",
				content:
					"How Packbat handles local archives, OAuth data, encrypted remote copies, and optional Cloud accounts.",
			},
		],
	}),
});

function PrivacyPage() {
	return (
		<div className="min-h-screen bg-ground text-ink">
			<SiteNav />
			<div className="mx-auto w-full max-w-[1440px]">
				<article className="w-full max-w-[830px] px-[20px] pt-[46px] pb-[80px] antialiased min-[900px]:px-[72px] min-[900px]:pt-[64px] min-[900px]:pb-[120px]">
					<ArticleIntro
						standfirst="Packbat is local-first. Your raw agent sessions stay in the archive you choose, and every off-box copy is encrypted before it leaves your machine."
						title="Privacy policy"
					/>
					<ArticleSection
						description={
							<div className="flex flex-col gap-[16px]">
								<p>
									This policy covers the Packbat command-line application, packbat.dev, user-owned remote storage, and
									optional Packbat Cloud. Packbat is operated by Liam Vinberg.
								</p>
								<p>Last updated: 18 July 2026.</p>
							</div>
						}
						id="scope"
						title="Scope"
					/>
					<ArticleSection
						description={
							<div className="flex flex-col gap-[16px]">
								<p>
									Packbat reads supported AI-agent session stores on your machine and writes verbatim, compressed
									archives to the local path you choose. The local archive, derived index, configuration, logs, and
									recovery material stay on your machine. Packbat does not send them to a Packbat service.
								</p>
								<p>
									Packbat does not include product telemetry, behavioral analytics, advertising trackers, or data
									collection for training AI models. The public website does not add analytics or tracking cookies. Its
									hosting provider may process standard network request data needed to serve and secure the site.
								</p>
							</div>
						}
						id="local-data"
						title="Local archives"
					/>
					<ArticleSection
						description={
							<div className="flex flex-col gap-[16px]">
								<p>
									If you connect Google Drive or Dropbox, Packbat requests the minimum storage access needed for the
									feature. Google Drive uses the <code>drive.file</code> scope, which limits Packbat to files it creates
									or that you explicitly open with it. Dropbox uses an App Folder, which confines Packbat to its
									dedicated folder. Packbat does not inspect unrelated files in either account.
								</p>
								<p>
									Packbat uses this access only to write, list, read, and restore Packbat archive objects and indexes.
									Archive objects and indexes are encrypted on your machine before upload. Google or Dropbox can see
									storage metadata needed to provide the service, such as object names, sizes, timestamps, and API
									request metadata, but not the plaintext session contents or encrypted index payload.
								</p>
								<p>
									OAuth access and refresh tokens are stored only in Packbat's private local configuration and sent to
									the selected provider when required to authorize storage operations. They are not sent to Packbat,
									included in the recovery kit, sold, shared for advertising, or used for model training.
								</p>
								<p>
									Packbat's use of information received from Google APIs adheres to the Google API Services User Data
									Policy, including its Limited Use requirements. Review the provider policies for more information:{" "}
									<a className={policyLinkClass} href="https://policies.google.com/privacy">
										Google Privacy Policy
									</a>
									{" and "}
									<a className={policyLinkClass} href="https://www.dropbox.com/privacy">
										Dropbox Privacy Policy
									</a>
									.
								</p>
							</div>
						}
						id="connected-storage"
						title="Google Drive and Dropbox"
					/>
					<ArticleSection
						description={
							<div className="flex flex-col gap-[16px]">
								<p>
									Packbat Cloud is optional. If you choose it, GitHub authenticates your account. Packbat stores your
									GitHub numeric account identifier, rotating CLI credential records, opaque machine identifiers, object
									names, sizes, checksums, storage accounting, and subscription state. It does not store your GitHub
									access token after the account exchange.
								</p>
								<p>
									Cloud archive bytes and indexes are encrypted before upload. Packbat Cloud stores ciphertext only; the
									private recovery key remains with you and never reaches Packbat. Cloudflare provides the API,
									database, and object-storage infrastructure.
								</p>
								<p>
									If you buy Packbat Cloud, Stripe processes payment details, billing name, address, tax information,
									and email. Packbat stores Stripe customer and subscription identifiers, plan interval, status, and
									timestamps, but does not receive or store card details, billing identity, or billing email.
								</p>
								<p>
									Read the relevant provider policies:{" "}
									<a
										className={policyLinkClass}
										href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
									>
										GitHub Privacy Statement
									</a>
									,{" "}
									<a className={policyLinkClass} href="https://www.cloudflare.com/privacypolicy/">
										Cloudflare Privacy Policy
									</a>
									, and{" "}
									<a className={policyLinkClass} href="https://stripe.com/privacy">
										Stripe Privacy Policy
									</a>
									.
								</p>
							</div>
						}
						id="packbat-cloud"
						title="Optional Packbat Cloud"
					/>
					<ArticleSection
						description={
							<div className="flex flex-col gap-[16px]">
								<p>
									Packbat does not sell personal data. It shares data only with a provider you direct it to use, with
									infrastructure providers needed to operate an optional service, when required by law, or when needed
									to protect users and the service from abuse. Packbat does not use Google or Dropbox user data for
									advertising, credit decisions, surveillance, or training generalized or personalized AI models.
								</p>
								<p>
									Packbat Cloud keeps minimal exception-only operational logs for up to seven days. These logs may
									contain an internal account identifier and an error or enforcement reason, but never archive contents,
									OAuth tokens, recovery keys, or behavioral analytics.
								</p>
							</div>
						}
						id="sharing"
						title="Sharing and operational data"
					/>
					<ArticleSection
						description={
							<div className="flex flex-col gap-[16px]">
								<p>
									Local archives and user-owned remote copies remain until you remove them from the storage you control.
									Local OAuth credentials remain until you unlink the destination, remove the private configuration, or
									revoke access in Google or Dropbox.
								</p>
								<p>
									Packbat Cloud retains ciphertext while your subscription is active. After a lapse or cancellation, it
									keeps the account and ciphertext available for restore during a 90-day grace period, then deletes the
									stored objects and account records. Packbat Cloud also supports authenticated account deletion; it
									fences outstanding upload links before deleting ciphertext and database records.
								</p>
							</div>
						}
						id="retention"
						title="Retention and deletion"
					/>
					<ArticleSection
						description={
							<div className="flex flex-col gap-[16px]">
								<p>
									You can use Packbat without an account or remote service. You can disconnect a remote, revoke its
									OAuth grant, delete data from storage you own, revoke a Packbat Cloud CLI credential, or delete the
									Cloud account. Depending on where you live, you may also have rights to access, correct, export,
									restrict, object to, or delete personal data Packbat controls.
								</p>
								<p>
									For privacy questions or requests,{" "}
									<a className={policyLinkClass} href="https://github.com/liamvinberg/packbat/issues/new">
										open a GitHub issue
									</a>
									. Do not include secrets, OAuth tokens, recovery keys, or raw session content in a public issue.
								</p>
								<p>
									This policy will be updated when Packbat's data practices materially change. The date at the top will
									show the latest revision.
								</p>
							</div>
						}
						id="choices"
						last
						title="Your choices and contact"
					/>
				</article>
			</div>
			<SiteFooter />
		</div>
	);
}
