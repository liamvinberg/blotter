import type { DocsPage, DocsPath } from "./docs-pages";
import { DocsSidebar } from "./docs-sidebar";

type DocsSelectorProps = {
	activePage: DocsPage | undefined;
	activePath: DocsPath | undefined;
};

export function DocsSelector({ activePage, activePath }: DocsSelectorProps) {
	return (
		<div className="w-full border-hairline border-b bg-ground px-[20px] py-[18px] antialiased min-[900px]:hidden">
			<details className="group relative mx-auto w-full max-w-[350px] bg-surface font-mono text-[11px] leading-[17px]">
				<summary className="flex cursor-pointer list-none items-center justify-between border border-hairline px-[14px] py-[12px] marker:content-none [&::-webkit-details-marker]:hidden">
					<span className="text-ink">{activePage?.title ?? "Docs"}</span>
					<span className="text-accent group-open:hidden">All docs ↓</span>
					<span className="hidden text-accent group-open:inline">Close ↑</span>
				</summary>
				<div className="absolute top-full right-0 left-0 z-20 border border-hairline border-t-0 bg-surface px-[14px] py-[18px]">
					<DocsSidebar activePath={activePath} compact />
				</div>
			</details>
		</div>
	);
}
