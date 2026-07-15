export function MechanismRestore() {
	return (
		<section className="bg-ground">
			<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[28px] px-[20px] py-[80px] min-[900px]:flex-row min-[900px]:items-center min-[900px]:gap-[112px] min-[900px]:px-[64px] min-[900px]:py-[120px]">
				<div className="flex flex-col gap-[28px] min-[900px]:w-[39.6%] min-[900px]:shrink-0">
					<span className="font-mono text-[12px] leading-ui text-accent min-[900px]:text-xs">03</span>
					<h2 className="text-h2-fluid font-display font-extrabold tracking-display text-ink">
						Bring the thread back.
					</h2>
					<p className="font-display text-[17px] leading-h3 text-muted min-[900px]:text-lg min-[900px]:leading-body">
						Restore returns every file to the exact place its harness expects, then prints the resume command.
					</p>
				</div>
				<div className="border-hairline flex w-full flex-col gap-[12px] rounded-md border bg-surface px-[20px] py-[24px] min-[900px]:w-[53.4%] min-[900px]:shrink-0 min-[900px]:gap-[14px] min-[900px]:p-[32px]">
					<code className="font-mono text-xs leading-[20px] text-ink min-[900px]:text-base min-[900px]:leading-mono">
						$ packbat restore c5de331a
					</code>
					<code className="font-mono text-[12px] leading-ui text-muted min-[900px]:hidden">
						restored 3 files to ~/.claude/projects/…
					</code>
					<code className="hidden font-mono text-xs leading-ui text-muted min-[900px]:block">
						restored 3 files to ~/.claude/projects/-Users-liam-projects
					</code>
					<code className="font-mono text-[12px] leading-ui text-ok min-[900px]:text-xs">claude --resume c5de331a</code>
				</div>
			</div>
		</section>
	);
}
