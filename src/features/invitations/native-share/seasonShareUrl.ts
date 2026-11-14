// Deliberately accepts no answers, identity, search parameters or historical route.
export function seasonShareUrl(location: Pick<Location, "origin" | "pathname">): string {
  return `${location.origin}${location.pathname}#/sheets/2026`;
}
