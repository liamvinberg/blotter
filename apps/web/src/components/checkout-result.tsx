import type { ReactNode } from "react";
import { SiteFooter } from "../sections/site-footer";
import { SiteNav } from "../sections/site-nav";

type CheckoutResultProps = {
	action: ReactNode;
	detail: string;
	status: string;
	title: string;
};

export function CheckoutResult({ action, detail, status, title }: CheckoutResultProps) {
	return (
		<div className="flex min-h-screen flex-col bg-ground text-ink antialiased [font-synthesis:none]">
			<SiteNav />
			<div className="flex flex-1 items-center">
				<section className="mx-auto grid w-full max-w-[1440px] gap-[42px] px-[20px] py-[72px] min-[900px]:grid-cols-[minmax(0,760px)_minmax(220px,1fr)] min-[900px]:items-end min-[900px]:gap-[96px] min-[900px]:px-[64px] min-[900px]:py-[120px]">
					<div className="flex flex-col gap-[28px]">
						<h1 className="max-w-[760px] font-display text-[44px] leading-[46px] font-black tracking-display text-ink min-[900px]:text-[68px] min-[900px]:leading-[68px]">
							{title}
						</h1>
						<p className="max-w-[650px] font-mono text-sm leading-[24px] text-muted min-[900px]:text-md min-[900px]:leading-body">
							{detail}
						</p>
						<div>{action}</div>
					</div>
					<div className="border-hairline border-t pt-[18px] font-mono text-xs leading-[20px] text-accent min-[900px]:border-t-2 min-[900px]:pt-[22px]">
						{status}
					</div>
				</section>
			</div>
			<SiteFooter />
		</div>
	);
}
