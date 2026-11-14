import { useEffect, useState } from "react";
import { Authenticator, type AuthenticatorProps } from "@aws-amplify/ui-react";
import { Hub } from "aws-amplify/utils";
import { LoginCelebration } from "./LoginCelebration";
import "./festive.css";

function FlyingReindeer({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g stroke="#dfb565" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m42-15-5-22m3 12-9-5m7-2 5-9m4 26 4-23m-2 12 8-6m-7-1-3-8" />
      </g>
      <path d="m-12 12-13-7 5 11" fill="#ad7954" />
      <g stroke="#ad7954" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="m-5 22-12 14-12-3M6 24l7 16 13 3m2-23 13 11 13-6m-17-7 17 1 7-9" />
      </g>
      <ellipse cx="10" cy="15" rx="25" ry="13" fill="#ad7954" />
      <path d="M25 19q0-18 13-30l12 5-12 29Z" fill="#ad7954" />
      <path d="m38-9-8-9q12-2 15 9" fill="#dfb98a" />
      <path d="M37-13q6-8 16-2l12 8q3 5-3 8H45Z" fill="#c79769" />
      <ellipse cx="64" cy="-5" rx="4" ry="3.5" fill="#af3449" />
      <circle cx="50" cy="-10" r="1.7" fill="#153f33" />
      <path d="m32 1 10 5" stroke="#af3449" strokeWidth="5" />
      <circle cx="37" cy="8" r="3" fill="#efd69a" />
      <g stroke="#153f33" strokeWidth="3" strokeLinecap="round"><path d="m-29 33-3-1m58 11 3 1m25-19 3-1m4-14 2-3" /></g>
    </g>
  );
}

function WinterPostcard() {
  return (
    <svg className="festive-postcard" viewBox="0 0 420 280" fill="none" aria-hidden="true">
      <circle cx="327" cy="51" r="30" fill="#efd69a" opacity=".9" />
      <g fill="#f9f3e6" opacity=".7">
        <circle cx="24" cy="84" r="2" /><circle cx="135" cy="26" r="2" />
        <circle cx="207" cy="65" r="2" /><circle cx="390" cy="141" r="2" />
        <circle cx="180" cy="190" r="2" /><circle cx="278" cy="145" r="2" />
        <path d="M57 42v12m-6-6h12M241 25v12m-6-6h12M383 28v12m-6-6h12" stroke="#f9f3e6" strokeWidth="2" />
      </g>
      <path d="M0 243q102-37 211-5t209-9v51H0Z" fill="#c7d9cb" />
      <g fill="#477761"><path d="m47 170-35 83h70Z" /><path d="m366 158-36 96h72Z" /></g>
      <g fill="#153f33"><path d="m99 174-35 88h70Z" /><path d="m298 140-42 116h84Z" /></g>
      <g stroke="#f9f3e6" strokeWidth="4" strokeLinecap="round"><path d="m36 207 11-26 11 26m29 9 12-29 12 29m174-32 13-30 13 30" /></g>
      <g className="festive-hero-flight">
        <path d="M19 180q-8 3-13 1m22 10-12 3m20-29-17 2" stroke="#efd69a" strokeWidth="2" strokeLinecap="round" opacity=".6" />
        <g stroke="#efd69a" strokeWidth="1.8" strokeLinecap="round">
          <path d="M146 122q55 22 123-20M146 126q109 17 210-43" />
        </g>
        <FlyingReindeer x={247} y={91} />
        <FlyingReindeer x={333} y={69} />
        {/* A full sack sits behind Santa, with wrapped presents peeking out. */}
        <g transform="rotate(-10 62 112)">
          <rect x="42" y="82" width="23" height="27" rx="2" fill="#af3449" />
          <path d="M53 82v27m-11-17h23" stroke="#fff7df" strokeWidth="3" />
          <rect x="64" y="86" width="21" height="23" rx="2" fill="#477761" />
          <path d="M74 86v23m-10-14h21" stroke="#efd69a" strokeWidth="3" />
          <path d="m41 102 7 12c-25 14-27 48 9 51h17c36-3 31-37 6-51l7-12-21 5Z" fill="#dfb565" stroke="#efd69a" strokeWidth="2" />
          <path d="M49 115q15 5 30 0m-18 8q-13 10-12 26" stroke="#a96c38" strokeWidth="2.5" strokeLinecap="round" />
          <path d="m78 116 12 9-5 10-12-9Z" fill="#fff7df" />
          <path d="m80 121 4 4m-5 0 4 4" stroke="#af3449" strokeWidth="1.5" />
        </g>
        {/* Santa's hat, beard and coat remain distinct at small sizes. */}
        <path d="M98 145q-5-37 15-42h14q14 13 15 42Z" fill="#af3449" />
        <path d="m125 112 14 15 15-8" stroke="#af3449" strokeWidth="11" strokeLinecap="round" />
        <path d="m151 120 6-3" stroke="#f9f3e6" strokeWidth="8" strokeLinecap="round" />
        <path d="M101 136h38" stroke="#153f33" strokeWidth="7" />
        <rect x="116" y="132" width="9" height="8" rx="1" stroke="#efd69a" strokeWidth="2" />
        <circle cx="118" cy="88" r="17" fill="#f0c4a0" />
        <path d="M101 88q2 7 9 7l8-3 8 3q8-1 10-7-1 27-18 30-18-6-17-30Z" fill="#f9f3e6" />
        <path d="M99 76q4-27 25-23l18 18-19-4-2 10Z" fill="#af3449" />
        <path d="M101 77q16-6 31 1" stroke="#f9f3e6" strokeWidth="7" strokeLinecap="round" />
        <circle cx="142" cy="71" r="5" fill="#f9f3e6" />
        <circle cx="115" cy="86" r="1.5" fill="#153f33" /><circle cx="127" cy="86" r="1.5" fill="#153f33" />
        <ellipse cx="122" cy="92" rx="4" ry="3" fill="#dfa282" />
        <path d="M29 142q24 11 84 7l31-5 7-15h15q3 36-22 47H65q-23-3-27-21Z" fill="#af3449" />
        <path d="M31 143q34 13 84 8l30-5q13-3 13-16" stroke="#efd69a" strokeWidth="4" strokeLinecap="round" />
        <path d="m65 176-7 12m71-12 7 12M37 189h115q22 0 25-14" stroke="#dfb565" strokeWidth="5" strokeLinecap="round" />
        <path d="M63 164h57" stroke="#efd69a" strokeWidth="2" strokeLinecap="round" opacity=".7" />
      </g>
      <path d="M0 264q130-26 246-5t174-5v26H0Z" fill="#f9f3e6" />
      <rect x="161" y="225" width="36" height="36" rx="3" fill="#af3449" />
      <path d="M179 225v36m-18-24h36" stroke="#efd69a" strokeWidth="5" />
      <path d="M179 225c-22-2-17-18-7-11Zm0 0c21-2 17-18 7-11Z" stroke="#efd69a" strokeWidth="3" />
      <rect x="202" y="239" width="25" height="25" rx="3" fill="#dfb565" />
      <path d="M214 239v25m-12-16h25" stroke="#fff7df" strokeWidth="3" />
    </svg>
  );
}

function FestiveHeader() {
  return (
    <header className="festive-intro">
      <div className="festive-wordmark"><span aria-hidden="true">W</span> WOLFEWARE <small>FAMILY TRADITIONS, REIMAGINED</small></div>
      <p className="festive-eyebrow">A LITTLE CHRISTMAS MAGIC</p>
      <h1>The Wolfe Family Fun</h1>
      <WinterPostcard />
      <div className="festive-tag"><span aria-hidden="true">✦</span> Santa’s Cheat Sheet</div>
    </header>
  );
}

function FestiveFooter() {
  return <footer className="festive-footer">Made for the Wolfe family <span aria-hidden="true">✦</span> A little help for a magical Christmas.</footer>;
}

const components = { Header: FestiveHeader, Footer: FestiveFooter };

/** Presentation only: Amplify still owns every form, session and auth transition. */
export function FestiveAuthenticator(props: AuthenticatorProps) {
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => Hub.listen("auth", ({ payload }) => {
    if (payload.event === "signedOut") {
      setCelebrating(false);
    } else if (payload.event === "signedIn") {
      setCelebrating(true);
    }
  }), []);
  useEffect(() => {
    if (!celebrating) return;
    const timeout = window.setTimeout(() => setCelebrating(false), 2800);
    return () => window.clearTimeout(timeout);
  }, [celebrating]);
  return (
    <div className="festive-auth">
      <Authenticator {...props} className="festive-entry" components={components} />
      {celebrating && <LoginCelebration />}
    </div>
  );
}
