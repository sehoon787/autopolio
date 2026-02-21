/**
 * Extract display name from a repo object or URL.
 * Falls back to the last path segment of the URL with .git stripped.
 */
export function getRepoDisplayName(repo: { label?: string | null; repo_url: string }): string {
  return repo.label || repo.repo_url.split('/').pop()?.replace('.git', '') || repo.repo_url
}

/**
 * Extract display name from a raw URL string.
 */
export function getRepoNameFromUrl(url: string): string {
  return url.split('/').pop()?.replace('.git', '') || url
}
