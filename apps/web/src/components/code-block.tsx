import { CopyButton } from "./copy-button";

type CodeTone = "ink" | "muted" | "ok" | "accent" | "problem";

export type CodeLine = {
	text: string;
	tone?: CodeTone;
};

type CodeBlockProps = {
	copy?: boolean;
	lines: CodeLine[];
};

const toneClass: Record<CodeTone, string> = {
	accent: "text-accent",
	ink: "text-ink",
	muted: "text-muted",
	ok: "text-ok",
	problem: "text-problem",
};

export function CodeBlock({ copy = false, lines }: CodeBlockProps) {
	const text = lines.map((line) => line.text).join("\n");
	return (
		<div className="flex w-full items-start justify-between gap-[12px] overflow-x-auto border border-hairline bg-surface px-[14px] py-[16px] font-mono text-[11px] leading-ui min-[900px]:px-[20px] min-[900px]:py-[18px] min-[900px]:text-xs min-[900px]:leading-[21px]">
			<pre className="min-w-0 whitespace-pre">
				<code className="flex flex-col gap-[10px] min-[900px]:gap-[12px]">
					{lines.map((line) => (
						<span className={toneClass[line.tone ?? "ink"]} key={line.text}>
							{line.text}
						</span>
					))}
				</code>
			</pre>
			{copy ? <CopyButton text={text} variant="plain" /> : null}
		</div>
	);
}
