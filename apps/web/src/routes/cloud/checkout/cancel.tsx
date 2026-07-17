import { createFileRoute } from "@tanstack/react-router";
import { CheckoutResult } from "../../../components/checkout-result";

export const Route = createFileRoute("/cloud/checkout/cancel")({
	component: CheckoutCancelPage,
	head: () => ({ meta: [{ title: "Packbat Cloud checkout cancelled" }] }),
});

function CheckoutCancelPage() {
	return (
		<CheckoutResult
			action={
				<a
					className="inline-flex rounded-sm border border-hairline px-[18px] py-[11px] font-display text-sm leading-ui font-bold text-ink"
					href="/"
				>
					Back to Packbat
				</a>
			}
			detail="Nothing was charged. Return to the terminal to try again, or close it if you do not want to link Packbat Cloud."
			status="Checkout cancelled. Your local archive is unchanged."
			title="Checkout cancelled."
		/>
	);
}
