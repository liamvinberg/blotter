import { describe, test } from "vitest";

describe.runIf(process.env.BLOTTER_RESUME_PROOF === "1")("resume proof", () => {
	test.todo(
		"Claude Code: fresh CLAUDE_CONFIG_DIR, disposable session, archive → delete → restore → claude --resume discovers and resumes",
	);
	test.todo(
		"Codex: fresh CODEX_HOME, disposable session, archive → delete → restore → codex unarchive/resume discovers and resumes",
	);
	test.todo(
		"pi: fresh PI_CODING_AGENT_SESSION_DIR, disposable session, archive → delete → restore → pi --session discovers and resumes without migration loss",
	);
});
