import type { RemoteConfig } from "../core/config.js";
import { copyFile, copyTree, joinRcloneDestination, remoteFileExists } from "./rclone.js";

export interface ArchiveRemote {
	readonly config: RemoteConfig;
	readonly destination: string;
	indexExists(machine: string): Promise<boolean>;
	putArchiveObjects(sourceRoot: string): Promise<void>;
	putIndex(machine: string, sourcePath: string): Promise<void>;
	getIndex(machine: string, destinationPath: string): Promise<void>;
	getArchiveObject(machine: string, archivePath: string, destinationPath: string): Promise<void>;
}

class RcloneArchiveRemote implements ArchiveRemote {
	readonly destination: string;

	constructor(readonly config: RemoteConfig) {
		this.destination = config.destination;
	}

	async indexExists(machine: string): Promise<boolean> {
		return await remoteFileExists(
			joinRcloneDestination(this.config.destination, `${machine}/index.jsonl.age`),
			this.config.rcloneConfig,
		);
	}

	async putArchiveObjects(sourceRoot: string): Promise<void> {
		await copyTree(sourceRoot, this.config.destination, this.config.rcloneConfig);
	}

	async putIndex(machine: string, sourcePath: string): Promise<void> {
		await copyFile(
			sourcePath,
			joinRcloneDestination(this.config.destination, `${machine}/index.jsonl.age`),
			this.config.rcloneConfig,
		);
	}

	async getIndex(machine: string, destinationPath: string): Promise<void> {
		await copyFile(
			joinRcloneDestination(this.config.destination, `${machine}/index.jsonl.age`),
			destinationPath,
			this.config.rcloneConfig,
		);
	}

	async getArchiveObject(machine: string, archivePath: string, destinationPath: string): Promise<void> {
		await copyFile(
			joinRcloneDestination(this.config.destination, `${machine}/${archivePath}.age`),
			destinationPath,
			this.config.rcloneConfig,
		);
	}
}

export function createArchiveRemote(config: RemoteConfig): ArchiveRemote {
	switch (config.type) {
		case "rclone":
			return new RcloneArchiveRemote(config);
	}
}
