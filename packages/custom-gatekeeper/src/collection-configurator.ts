import { RpcTarget } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import { collectionResourceUrl } from "./collection-resource.js";
import { KnowledgeRepository } from "./knowledge.js";
import type {
  ConfiguratorOption,
  CollectionConfiguratorRpc,
} from "./configurator/collection-configurator-types.js";
import type { KnowledgePrincipal } from "./types.js";

const OPTION_LIMIT = 50;

export function collectionMatchesQuery(
  collection: { title: string; description: string; tags: string[] },
  query: string,
): boolean {
  let tokens = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  if (tokens.length === 0) return true;
  let haystack = [collection.title, collection.description, ...collection.tags]
    .join(" ").toLocaleLowerCase();
  return tokens.every(token => haystack.includes(token));
}

@validateRpc()
export class CollectionConfiguratorUi extends RpcTarget implements CollectionConfiguratorRpc {
  readonly #repository: KnowledgeRepository;
  readonly #principal: KnowledgePrincipal;

  constructor(repository: KnowledgeRepository, principal: KnowledgePrincipal) {
    super();
    this.#repository = repository;
    this.#principal = principal;
  }

  async listCollections(query: string): Promise<ConfiguratorOption[]> {
    let collections = await this.#repository.listCollections(this.#principal);
    return collections
      .filter(collection => collectionMatchesQuery(collection, query))
      .slice(0, OPTION_LIMIT)
      .map(collection => ({
        value: collectionResourceUrl(collection.id),
        title: collection.title,
        subtitle: collection.description || undefined,
        meta: collection.tags.length > 0 ? collection.tags.join(", ") : collection.role,
      }));
  }
}
