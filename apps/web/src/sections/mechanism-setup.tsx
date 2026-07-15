export function MechanismSetup() {
	return (
		<section className="border-hairline border-t bg-ground" id="how-it-works">
			<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[40px] px-[20px] py-[80px] min-[900px]:gap-[72px] min-[900px]:px-[64px] min-[900px]:py-[120px]">
				<div className="flex flex-col gap-[40px] min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between min-[900px]:gap-[96px]">
					<h2 className="text-h2-fluid font-display font-extrabold tracking-display text-ink min-[900px]:w-[44.2%] min-[900px]:shrink-0">
						Set it up once.
					</h2>
					<p className="font-display text-[17px] leading-h3 text-muted min-[900px]:w-[36.6%] min-[900px]:shrink-0 min-[900px]:text-lg min-[900px]:leading-body">
						The wizard finds your harnesses, creates the archive, and installs the schedule.
					</p>
				</div>
				<div className="border-hairline flex flex-col gap-[20px] border-y py-[28px] min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between min-[900px]:gap-0 min-[900px]:py-[48px]">
					<div className="flex items-center gap-[20px] min-[900px]:gap-[32px]">
						<span className="font-mono text-[12px] leading-ui text-accent min-[900px]:text-xs">01</span>
						<code className="font-mono text-lg leading-[24px] text-ink min-[900px]:text-xl min-[900px]:leading-wordmark">
							$ packbat init
						</code>
					</div>
					<p className="font-display text-base leading-[24px] text-muted min-[900px]:w-[36.6%] min-[900px]:shrink-0">
						Choose the archive location. Add an encrypted remote or skip it. Packbat runs the first sync and checks
						itself.
					</p>
				</div>
			</div>
		</section>
	);
}
