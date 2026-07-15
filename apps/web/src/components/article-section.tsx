import type { ReactNode } from "react";

type ArticleSectionProps = {
	children?: ReactNode;
	description?: ReactNode;
	id: string;
	last?: boolean;
	title: string;
};

export function ArticleSection({ children, description, id, last = false, title }: ArticleSectionProps) {
	return (
		<section
			className={`flex scroll-mt-[20px] flex-col gap-[18px] ${
				last ? "pt-[42px] min-[900px]:pt-[52px]" : "border-hairline border-b py-[42px] min-[900px]:py-[52px]"
			} min-[900px]:gap-[20px]`}
			id={id}
		>
			<h2 className="font-display text-[28px] leading-[31px] font-extrabold tracking-[-0.02em] text-ink min-[900px]:text-[30px] min-[900px]:leading-[34px]">
				{title}
			</h2>
			{description === undefined ? null : (
				<div className="max-w-[650px] font-mono text-[12px] leading-[20px] text-muted min-[900px]:text-sm min-[900px]:leading-[24px]">
					{description}
				</div>
			)}
			{children}
		</section>
	);
}
