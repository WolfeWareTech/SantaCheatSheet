import { useEffect, useState } from "react";
import { Authenticator, type AuthenticatorProps } from "@aws-amplify/ui-react";
import { Hub } from "aws-amplify/utils";
import { LoginCelebration } from "./LoginCelebration";
import "./festive.css";

function WinterPostcard() {
  return (
    <svg className="festive-postcard" viewBox="0 0 420 250" fill="none" aria-hidden="true">
      <circle cx="327" cy="56" r="31" fill="#efd69a" />
      <g fill="#f9f3e6" opacity=".7">
        <circle cx="43" cy="45" r="2" /><circle cx="135" cy="26" r="2" />
        <circle cx="235" cy="74" r="2" /><circle cx="377" cy="113" r="2" />
        <path d="M82 68v12m-6-6h12M266 22v12m-6-6h12M371 32v12m-6-6h12" stroke="#f9f3e6" strokeWidth="2" />
      </g>
      <path d="M0 213Q102 176 211 208T420 197V250H0Z" fill="#c7d9cb" />
      <g fill="#477761"><path d="m66 60-43 113h86Z" /><path d="m340 98-40 108h80Z" /></g>
      <g fill="#153f33"><path d="m114 87-48 132h96Z" /><path d="m294 48-55 164h110Z" /></g>
      <g stroke="#f9f3e6" strokeWidth="5" strokeLinecap="round"><path d="m52 111 14-35 14 35m17 45 17-48 17 48m149-66 14-42 14 42" /></g>
      <path d="M0 234q130-38 246-6t174-5v27H0Z" fill="#f9f3e6" />
      <rect x="159" y="166" width="47" height="48" rx="4" fill="#af3449" />
      <path d="M183 166v48m-24-33h47" stroke="#efd69a" strokeWidth="6" />
      <path d="M183 166c-29-2-22-24-9-14Zm0 0c27-3 22-24 9-14Z" stroke="#efd69a" strokeWidth="4" />
      <rect x="208" y="184" width="32" height="32" rx="3" fill="#dfb565" />
      <path d="M224 184v32m-16-20h32" stroke="#fff7df" strokeWidth="4" />
      <path d="m177 91 5 9 10 2-7 7 1 11-9-5-9 5 2-11-8-7 11-2Z" fill="#efd69a" />
      <path d="M200 135q21-16 37-10" stroke="#efd69a" strokeWidth="2" strokeDasharray="3 7" />
    </svg>
  );
}

function FestiveHeader() {
  return (
    <header className="festive-intro">
      <div className="festive-wordmark"><span aria-hidden="true">W</span> WOLFEWARE <small>FAMILY TRADITIONS, REIMAGINED</small></div>
      <p className="festive-eyebrow">A LITTLE CHRISTMAS MAGIC</p>
      <h1>Good gifts.<br />Great secrets.</h1>
      <p className="festive-description">Santa has a list.<br />Your family has the inside scoop.</p>
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
