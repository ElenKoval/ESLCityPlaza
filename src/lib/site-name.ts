export const SITE_NAME = "Conversations on the Plaza";

export function sitePageTitle(page?: string) {
  return page ? `${page} — ${SITE_NAME}` : SITE_NAME;
}
