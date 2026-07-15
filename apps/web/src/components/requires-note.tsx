type RequiresNoteProps = {
	children: string;
};

export function RequiresNote({ children }: RequiresNoteProps) {
	return (
		<div className="flex w-full flex-col gap-[5px] border-l-[3px] border-accent bg-surface px-[16px] py-[15px] font-mono text-[11px] leading-ui min-[900px]:flex-row min-[900px]:items-start min-[900px]:gap-[12px] min-[900px]:px-[18px] min-[900px]:py-[17px] min-[900px]:text-[12px] min-[900px]:leading-[20px]">
			<span className="shrink-0 text-accent">Requires</span>
			<span className="text-muted">{children}</span>
		</div>
	);
}
