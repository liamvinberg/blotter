import { RequiresNote } from "./requires-note";

type ArticleIntroProps = {
	title: string;
	standfirst: string;
	requires?: string;
};

export function ArticleIntro({ title, standfirst, requires }: ArticleIntroProps) {
	return (
		<header className="flex w-full flex-col gap-[19px] border-hairline border-b pb-[42px] min-[900px]:gap-[22px] min-[900px]:pb-[54px]">
			<h1 className="font-display text-[42px] leading-[43px] font-black tracking-display text-ink min-[900px]:text-[52px] min-[900px]:leading-[54px]">
				{title}
			</h1>
			<p className="max-w-[650px] font-mono text-sm leading-[23px] text-muted min-[900px]:text-md min-[900px]:leading-body">
				{standfirst}
			</p>
			{requires === undefined ? null : <RequiresNote>{requires}</RequiresNote>}
		</header>
	);
}
