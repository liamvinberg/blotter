import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DocsNav } from "./docs-nav";
import { DocsOnThisPage } from "./docs-on-this-page";
import { docsPageForPath } from "./docs-pages";
import { DocsSelector } from "./docs-selector";
import { DocsSidebar } from "./docs-sidebar";

type DocsShellProps = {
	children: ReactNode;
};

export function DocsShell({ children }: DocsShellProps) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const activePage = docsPageForPath(pathname);

	return (
		<div className="min-h-screen bg-ground text-ink">
			<DocsNav />
			<DocsSelector activePage={activePage} activePath={activePage?.path} />
			<div className="mx-auto flex min-h-[1618px] w-full max-w-[1440px] items-start">
				<DocsSidebar activePath={activePage?.path} />
				<article className="w-full min-w-0 max-w-[830px] px-[20px] pt-[46px] pb-[80px] antialiased min-[900px]:px-[72px] min-[900px]:pt-[64px] min-[900px]:pb-[120px]">
					{children}
				</article>
				<DocsOnThisPage sections={activePage?.sections ?? []} />
			</div>
		</div>
	);
}
