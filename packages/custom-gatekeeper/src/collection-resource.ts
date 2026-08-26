export const COLLECTION_RESOURCE_URL_PATTERN =
  "custom://restricted-knowledge/collections/:collectionId";

const collectionIdPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export function collectionResourceUrl(collectionId: string): string {
  if (!collectionIdPattern.test(collectionId)) {
    throw new Error("Invalid collection ID.");
  }
  return `custom://restricted-knowledge/collections/${collectionId}`;
}

export function collectionIdFromResourceUrl(resourceUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(resourceUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "custom:" || url.hostname !== "restricted-knowledge" ||
      url.username || url.password || url.port || url.search || url.hash) {
    return null;
  }

  let match = /^\/collections\/([^/]+)$/.exec(url.pathname);
  if (!match) return null;

  let collectionId: string;
  try {
    collectionId = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return collectionIdPattern.test(collectionId) ? collectionId : null;
}
