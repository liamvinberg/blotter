import { describe, expect, it } from "vitest";
import { nextPollIntervalSeconds } from "./device-flow.js";

describe("GitHub device-flow polling", () => {
	it("keeps the server interval while authorization is pending", () => {
		expect(nextPollIntervalSeconds(5, "authorization-pending")).toBe(5);
	});

	it("permanently adds five seconds for every slow-down response", () => {
		const first = nextPollIntervalSeconds(5, "slow-down");
		expect(first).toBe(10);
		expect(nextPollIntervalSeconds(first, "slow-down")).toBe(15);
	});

	it("backs off exponentially on network timeouts with a finite ceiling", () => {
		expect(nextPollIntervalSeconds(5, "network-timeout")).toBe(10);
		expect(nextPollIntervalSeconds(40, "network-timeout")).toBe(60);
		expect(nextPollIntervalSeconds(60, "network-timeout")).toBe(60);
	});
});
