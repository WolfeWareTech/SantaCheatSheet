// A best-effort composer handoff, never a send request. No recipient is supplied.
// Apple does not guarantee body prefilling; keep Copy available on every device.
export function textDraftUri(url: string, browser: Pick<Navigator, "userAgent" | "maxTouchPoints">): string | null {
  const { userAgent, maxTouchPoints } = browser;
  const appleMobile = /iPhone|iPad|iPod/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  if (appleMobile) return `sms:&body=${encodeURIComponent(url)}`;
  if (/Android/i.test(userAgent)) return `sms:?body=${encodeURIComponent(url)}`;
  return null;
}
