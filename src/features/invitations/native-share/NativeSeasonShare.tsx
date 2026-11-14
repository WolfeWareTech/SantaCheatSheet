import { useId, useRef, useState } from "react";
import { seasonShareUrl } from "./seasonShareUrl";
import "./native-share.css";

export function NativeSeasonShare() {
  const [message, setMessage] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const linkId = useId();
  const url = seasonShareUrl(window.location);

  async function share() {
    if (pending.current) return;
    if (typeof navigator.share !== "function") {
      setShowLink(true);
      setMessage("Sharing is unavailable in this browser. Copy the link or select it below.");
      return;
    }
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      // Invoke directly from the click; awaiting other work loses phone user activation.
      await navigator.share({ title: "Santa Cheat Sheet 2026", url });
      setMessage("Review and send in your chosen app. You can share again or copy the link.");
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
        setMessage("Sharing canceled. You can try again or copy the link.");
      } else {
        setShowLink(true);
        setMessage("Could not open sharing. Try again, copy the link, or select it below.");
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function copy() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (typeof navigator.clipboard?.writeText !== "function") throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setMessage("Link copied. Paste it into your message.");
    } catch {
      setShowLink(true);
      setMessage("Could not copy automatically. Select the link below and copy it.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <section className="native-season-share no-print no-capture" aria-label="Share the 2026 link">
    <div className="native-season-share__actions">
      <button type="button" disabled={busy} onClick={() => { void share(); }}>Share 2026 link</button>
      <button type="button" disabled={busy} onClick={() => { void copy(); }}>Copy link</button>
    </div>
    <p>Choose contacts, review, and send in your phone’s share options. This link opens each person’s own sheet after sign-in; it contains no answers.</p>
    <p role="status" aria-live="polite">{message}</p>
    {showLink && <div className="native-season-share__fallback">
      <label htmlFor={linkId}>2026 sign-in link</label>
      <input id={linkId} type="text" readOnly value={url} onFocus={event => event.currentTarget.select()} />
    </div>}
  </section>;
}
