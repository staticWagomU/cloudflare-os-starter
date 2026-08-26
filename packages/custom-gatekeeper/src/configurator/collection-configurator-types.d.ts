export type ConfiguratorOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type CollectionConfiguratorValues = {
  /** Canonical URL of the selected collection. */
  collectionUrl?: string | null;
}

export interface CollectionConfiguratorRpc {
  /** Searches only collections readable by the connected principal. */
  listCollections(query: string): Promise<ConfiguratorOption[]>;
}
