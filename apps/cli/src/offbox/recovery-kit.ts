import packageMetadata from "../../package.json" with { type: "json" };

export interface RecoveryKitInput {
	identity: string;
	recipient: string;
	destination: string;
	createdAt: string;
}

export function renderRecoveryKit(input: RecoveryKitInput): string {
	return `blotter recovery kit
blotter version: ${packageMetadata.version}
format: 1
created: ${input.createdAt}

Age identity
${input.identity}

Age recipient
${input.recipient}

Remote destination
${input.destination}

Fresh-machine setup
Configure rclone access to ${input.destination}, then run:
blotter init --yes --offbox remote --offbox-remote ${input.destination} --age-recipient ${input.recipient} --rclone-config default

Fresh-machine restore
blotter restore --from-remote --identity <kit-file> <unit> --machine <source-machine>

Raw age fallback
age -d -i <kit-file> -o <archive-file> <archive-file>.age

If every copy of this identity is lost, nobody can recover this archive.
`;
}

export function recipientChallenge(recipient: string): string {
	return recipient.slice(-8);
}
