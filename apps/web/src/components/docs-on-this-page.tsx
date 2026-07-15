import type { DocsSectionLink } from "./docs-pages";

type DocsOnThisPageProps = {
	sections: DocsSectionLink[];
};

export function DocsOnThisPage({ sections }: DocsOnThisPageProps) {
	if (sections.length === 0) return null;

	return (
		<aside className="hidden w-[250px] shrink-0 border-hairline border-l pt-[68px] pr-[48px] pb-[80px] pl-[30px] antialiased min-[1200px]:block">
			<div className="flex flex-col gap-[13px] font-mono">
				<div className="pb-[5px] text-[10px] leading-[17px] tracking-[0.08em] text-muted-deep">ON THIS PAGE</div>
				{sections.map((section, index) => (
					<a
						className={`text-[11px] leading-[17px] ${index === 0 ? "text-accent" : "text-muted"}`}
						href={`#${section.id}`}
						key={section.id}
					>
						{section.title}
					</a>
				))}
			</div>
		</aside>
	);
}
