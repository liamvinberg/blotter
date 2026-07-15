import { Link } from "@tanstack/react-router";
import { DOCS_GROUPS, type DocsGroup, type DocsPath } from "./docs-pages";

type DocsSidebarProps = {
	activePath: DocsPath | undefined;
	compact?: boolean;
};

function DocsGroupLinks({ activePath, group }: DocsSidebarProps & { group: DocsGroup }) {
	const groupIsActive = group.pages.some((page) => page.path === activePath);
	return (
		<div className="flex flex-col gap-[12px]">
			<div className="font-mono text-[10px] leading-ui tracking-[0.08em] text-muted-deep">{group.title}</div>
			{group.pages.map((page) => {
				const active = page.path === activePath;
				const indented = groupIsActive && !active;
				return (
					<Link
						activeOptions={{ exact: true }}
						aria-current={active ? "page" : undefined}
						className={`font-mono text-[12px] leading-ui ${
							active ? "border-l-2 border-accent pl-[14px] text-accent" : `${indented ? "pl-[16px]" : ""} text-muted`
						}`}
						key={page.path}
						to={page.path}
					>
						{page.title}
					</Link>
				);
			})}
		</div>
	);
}

export function DocsSidebar({ activePath, compact = false }: DocsSidebarProps) {
	const links = (
		<div className={`flex flex-col gap-[30px] ${compact ? "w-full" : "w-[194px]"}`}>
			{DOCS_GROUPS.map((group) => (
				<DocsGroupLinks activePath={activePath} group={group} key={group.title} />
			))}
		</div>
	);

	if (compact) return links;

	return (
		<aside className="hidden w-[278px] shrink-0 border-hairline border-r pt-[52px] pr-[36px] pb-[80px] pl-[48px] antialiased min-[900px]:block">
			{links}
		</aside>
	);
}
