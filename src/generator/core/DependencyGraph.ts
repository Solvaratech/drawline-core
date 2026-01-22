import { SchemaCollection, SchemaRelationship } from "../../types/schemaDesign";
import type { DependencyNode, RelationshipMap } from "../types";
import { logger } from "../../utils";

/**
 * Resolves dependencies to determine generation order.
 */

// TODO - add comments to explain the logic for dependency resolution

export class DependencyGraph {
	private nodes: Map<string, DependencyNode> = new Map();
	private relationshipMap: RelationshipMap;
	private hasCycle: boolean = false;
	private idToName: Map<string, string> = new Map();

	constructor(
		collections: SchemaCollection[],
		relationships: SchemaRelationship[]
	) {
		for (const col of collections) {
			this.idToName.set(col.id, col.name);
		}
		this.relationshipMap = this.buildRelationshipMap(collections, relationships);
		this.buildNodes(collections, relationships);
		this.resolveDependencies();
	}

	private buildRelationshipMap(collections: SchemaCollection[], relationships: SchemaRelationship[]): RelationshipMap {
		const byFrom = new Map<string, SchemaRelationship[]>();
		const byTo = new Map<string, SchemaRelationship[]>();
		const byId = new Map<string, SchemaRelationship>();

		// Initialize maps for all collections
		for (const col of collections) {
			byFrom.set(col.name, []);
			byTo.set(col.name, []);
		}

		for (const rel of relationships) {
			byId.set(rel.id, rel);

			const fromName = this.idToName.get(rel.fromCollectionId);
			const toName = this.idToName.get(rel.toCollectionId);

			if (fromName) {
				if (!byFrom.has(fromName)) byFrom.set(fromName, []);
				byFrom.get(fromName)!.push(rel);
			}
			if (toName) {
				if (!byTo.has(toName)) byTo.set(toName, []);
				byTo.get(toName)!.push(rel);
			}
		}

		return { byFrom, byTo, byId };
	}

	private buildNodes(
		collections: SchemaCollection[],
		relationships: SchemaRelationship[]
	): void {
		const nameToCollection = new Map<string, SchemaCollection>();
		for (const coll of collections) {
			nameToCollection.set(coll.name, coll);
			this.nodes.set(coll.name, {
				collectionName: coll.name,
				collection: coll,
				dependencies: new Set(),
				strongDependencies: new Set(),
				dependents: new Set(),
				level: 0,
			});
		}

		const addDependency = (from: string, to: string, isStrong: boolean) => {
			if (from === to) return;
			const fromNode = this.nodes.get(from);
			const toNode = this.nodes.get(to);
			if (fromNode && toNode) {
				fromNode.dependencies.add(to);
				if (isStrong) fromNode.strongDependencies.add(to);
				toNode.dependents.add(from);
			}
		};

		for (const rel of relationships) {
			const fromName = this.idToName.get(rel.fromCollectionId);
			const toName = this.idToName.get(rel.toCollectionId);

			if (!fromName || !toName) {
				logger.log("DependencyGraph", `Skipping relationship - collection ID not found in schema`);
				continue;
			}

			const fromCollection = nameToCollection.get(fromName);

			switch (rel.type) {
				case "one-to-one":
				case "many-to-one": {
					// Child depends on Parent (from depends on to)
					let isStrong = false;
					if (fromCollection) {
						// Check if explicit field is required
						if (rel.fromField) {
							const field = fromCollection.fields.find(f => f.name === rel.fromField);
							if (field && field.required) isStrong = true;
						}

						// If not yet strong, check if backing field implies it
						if (!isStrong) {
							const backingField = fromCollection.fields.find(f =>
								(f.type === 'reference' && (f as any).referencedCollectionId === rel.toCollectionId) ||
								f.name === rel.fromField
							);
							// Default to strong if required OR not found (conservative)
							if (!backingField || backingField.required) {
								isStrong = true;
							}
						}
					}
					addDependency(fromName, toName, isStrong);
					break;
				}

				case "one-to-many": {
					const toCollection = nameToCollection.get(toName);
					let isStrong = false;
					if (toCollection) {
						const backingField = toCollection.fields.find(f =>
							(f.type === 'reference' && (f as any).referencedCollectionId === rel.fromCollectionId) ||
							f.name === rel.toField
						);
						if (!backingField || backingField.required) {
							isStrong = true;
						}
					}
					addDependency(toName, fromName, isStrong);
					break;
				}

				case "many-to-many":
					addDependency(fromName, toName, false);
					addDependency(toName, fromName, false);
					break;
			}
		}

		// Scan for implicit field-based dependencies
		for (const collection of collections) {
			const fromName = collection.name;

			for (const field of collection.fields) {
				if (field.type === 'reference' && (field as any).referencedCollectionId) {
					const targetId = (field as any).referencedCollectionId;
					const toName = this.idToName.get(targetId) || targetId;

					if (toName) {
						addDependency(fromName, toName, field.required ?? false);
					}
				}
				// Implicit References (Heuristic)
				else if (field.type === 'objectid' && field.name.endsWith('Id') && field.name.length > 2) {
					const baseName = field.name.slice(0, -2);
					for (const [nodeName] of this.nodes) {
						if (nodeName.toLowerCase() === baseName.toLowerCase() && nodeName !== fromName) {
							logger.log("DependencyGraph", `Heuristic Match: ${fromName} depends on ${nodeName} via ${field.name}`);
							addDependency(fromName, nodeName, field.required ?? false);
							break;
						}
					}
				}
			}
		}
	}

	/**
	 * Calculates dependency levels and breaks cycles.
	 */
	private resolveDependencies(): void {
		const queue: string[] = [];
		const inDegree = new Map<string, number>();

		for (const [name, node] of this.nodes) {
			inDegree.set(name, node.dependencies.size);
		}

		for (const [name, degree] of inDegree) {
			if (degree === 0) {
				queue.push(name);
			}
		}

		let currentLevel = 0;
		const processed = new Set<string>();

		while (processed.size < this.nodes.size) {
			const levelSize = queue.length;

			if (levelSize === 0) {
				// Cycle detected. Find candidate to break.
				// Heuristic: Prefer breaking weak dependencies first.
				const remainingNodes = Array.from(this.nodes.keys()).filter(n => !processed.has(n));
				if (remainingNodes.length === 0) break;

				let candidate: string | null = null;

				for (const nodeName of remainingNodes) {
					const node = this.nodes.get(nodeName)!;
					let activeStrongDeps = 0;
					for (const dep of node.strongDependencies) {
						if (!processed.has(dep)) {
							activeStrongDeps++;
						}
					}

					if (activeStrongDeps === 0) {
						candidate = nodeName;
						break;
					}
				}

				if (!candidate) {
					// Fallback: Pick any remaining node
					candidate = remainingNodes[0];
					const node = this.nodes.get(candidate);
					const depCount = node ? node.dependencies.size : '?';
					logger.warn("DependencyGraph", `STRONG Cycle detected. Forcing break at: ${candidate} (deps: ${depCount})`);
				} else {
					logger.warn("DependencyGraph", `Cycle detected. Breaking WEAK dependency for: ${candidate}`);
				}

				if (candidate) {
					queue.push(candidate);
					this.hasCycle = true;
				}
			}

			// Process the queue items for this level
			const currentQueueLength = queue.length;
			for (let i = 0; i < currentQueueLength; i++) {
				const name = queue.shift();
				if (!name) break;
				if (processed.has(name)) continue;

				processed.add(name);
				const node = this.nodes.get(name)!;
				node.level = currentLevel;

				// Update neighbors
				for (const dependent of node.dependents) {
					if (!processed.has(dependent)) {
						const currentDegree = inDegree.get(dependent) || 0;
						inDegree.set(dependent, currentDegree - 1);
						if (inDegree.get(dependent) === 0) {
							queue.push(dependent);
						}
					}
				}
			}

			currentLevel++;
		}
	}

	getGenerationOrder(): SchemaCollection[] {
		const sorted = Array.from(this.nodes.values())
			.sort((a, b) => a.level - b.level)
			.map(node => node.collection);

		return sorted;
	}

	getDependencies(collectionName: string): string[] {
		const node = this.nodes.get(collectionName);
		return node ? Array.from(node.dependencies) : [];
	}

	getNodes(): Map<string, DependencyNode> {
		return this.nodes;
	}

	getRelationshipMap(): RelationshipMap {
		return this.relationshipMap;
	}

	hasCircularDependencies(): boolean {
		return this.hasCycle;
	}

	getParallelGroups(): SchemaCollection[][] {
		const groups = new Map<number, SchemaCollection[]>();

		for (const node of this.nodes.values()) {
			if (!groups.has(node.level)) {
				groups.set(node.level, []);
			}
			groups.get(node.level)!.push(node.collection);
		}

		return Array.from(groups.entries())
			.sort(([a], [b]) => a - b)
			.map(([, collections]) => collections);
	}
}

