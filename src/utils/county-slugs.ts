/**
 * County Slug Utilities
 * Bidirectional conversion between county names and URL slugs
 *
 * Examples:
 *   countyToSlug("County Dublin") → "dublin"
 *   countyToSlug("County Limerick") → "limerick"
 *   slugToCounty("dublin") → "County Dublin"
 *   slugToCounty("limerick") → "County Limerick"
 */

/**
 * Convert county name to URL slug
 * @param countyName - Full county name (e.g., "County Dublin")
 * @returns URL-friendly slug (e.g., "dublin")
 */
export function countyToSlug(countyName: string): string {
  return countyName
    .replace(/^County\s+/i, '') // Remove "County " prefix (case-insensitive)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-'); // Multi-word counties: spaces → hyphens
}

/**
 * Convert URL slug to county name format
 * @param slug - URL slug (e.g., "dublin" or "north-tipperary")
 * @returns Full county name (e.g., "County Dublin" or "County North Tipperary")
 */
export function slugToCounty(slug: string): string {
  const normalized = slug
    .toLowerCase()
    .trim()
    .replace(/-/g, ' '); // Hyphens → spaces for multi-word counties

  // Capitalize each word
  const capitalized = normalized
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return `County ${capitalized}`;
}
