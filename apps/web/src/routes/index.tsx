import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "../sections/hero";
import { MechanismDoctor } from "../sections/mechanism-doctor";
import { MechanismOffbox } from "../sections/mechanism-offbox";
import { MechanismRestore } from "../sections/mechanism-restore";
import { MechanismSetup } from "../sections/mechanism-setup";
import { MechanismSync } from "../sections/mechanism-sync";
import { SiteFooter } from "../sections/site-footer";
import { SiteNav } from "../sections/site-nav";

export const Route = createFileRoute("/")({
	component: LandingPage,
});

function LandingPage() {
	return (
		<div className="overflow-clip bg-ground antialiased [font-synthesis:none]">
			<div className="relative overflow-clip bg-ground">
				<SiteNav />
				<Hero />
			</div>
			<MechanismSetup />
			<MechanismSync />
			<MechanismRestore />
			<MechanismOffbox />
			<MechanismDoctor />
			<SiteFooter />
		</div>
	);
}
