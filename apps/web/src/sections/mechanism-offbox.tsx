const locations = [
	{
		label: "on this machine",
		body: "Raw archive and the public encryption recipient.",
	},
	{
		label: "on your remote",
		body: "Ciphertext only. S3-compatible storage, SFTP, or any rclone remote.",
	},
	{
		label: "with you",
		body: "The recovery kit. Keep a copy off the machine.",
	},
] as const;

export function MechanismOffbox() {
	return (
		<section className="border-hairline border-y bg-surface">
			<div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[40px] px-[20px] py-[80px] min-[900px]:flex-row min-[900px]:items-start min-[900px]:gap-[112px] min-[900px]:px-[64px] min-[900px]:py-[120px]">
				<div className="flex flex-col gap-[40px] min-[900px]:w-[39.6%] min-[900px]:shrink-0 min-[900px]:gap-[28px]">
					<h2 className="text-h2-fluid font-display font-extrabold tracking-display text-ink">
						Your remote never sees a session.
					</h2>
					<p className="font-display text-[17px] leading-h3 text-muted min-[900px]:text-lg min-[900px]:leading-body">
						Packbat encrypts every off-box copy before upload. The recovery kit holds the only key.
					</p>
				</div>
				<div className="border-hairline flex flex-col border-t min-[900px]:w-[53.4%] min-[900px]:shrink-0">
					{locations.map((location) => (
						<div
							className="border-hairline flex flex-col gap-[10px] border-b py-[24px] min-[900px]:flex-row min-[900px]:gap-0 min-[900px]:py-[28px]"
							key={location.label}
						>
							<h3 className="font-mono text-[12px] leading-ui text-accent min-[900px]:w-[25.7%] min-[900px]:shrink-0 min-[900px]:text-xs">
								{location.label}
							</h3>
							<p className="font-display text-base leading-[24px] text-ink min-[900px]:w-[65.7%] min-[900px]:shrink-0">
								{location.body}
							</p>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
