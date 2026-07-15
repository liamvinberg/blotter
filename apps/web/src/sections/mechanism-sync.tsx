const facts = [
	{
		title: "New and changed sessions",
		body: "A cheap stat walk finds only what needs archiving.",
	},
	{
		title: "Compressed verbatim",
		body: "The raw file is kept in its native shape and scoped to this machine.",
	},
	{
		title: "Caught up after sleep",
		body: "The schedule runs again at login or wake, so missed hours do not become gaps.",
	},
] as const;

export function MechanismSync() {
	return (
		<section className="border-hairline border-y bg-surface">
			<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[44px] px-[20px] py-[80px] min-[900px]:flex-row min-[900px]:gap-[96px] min-[900px]:px-[64px] min-[900px]:py-[120px]">
				<div className="flex flex-col gap-[44px] min-[900px]:w-[45.7%] min-[900px]:shrink-0 min-[900px]:gap-[32px]">
					<span className="font-mono text-[12px] leading-ui text-accent min-[900px]:text-xs">02</span>
					<h2 className="text-h2-lg-fluid font-display font-extrabold tracking-display text-ink">
						Every hour, the archive catches up.
					</h2>
				</div>
				<div className="border-hairline flex flex-col border-t min-[900px]:w-[45.7%] min-[900px]:shrink-0">
					{facts.map((fact) => (
						<div
							className="border-hairline flex flex-col gap-[10px] border-b py-[26px] min-[900px]:gap-[12px] min-[900px]:py-[28px]"
							key={fact.title}
						>
							<h3 className="font-display text-[21px] leading-h3 font-bold text-ink min-[900px]:text-xl">
								{fact.title}
							</h3>
							<p className="font-display text-base leading-[24px] text-muted">{fact.body}</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
