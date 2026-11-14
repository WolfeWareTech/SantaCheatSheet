import type { ReactNode } from "react";
import { authFixture } from "./mockHub";
export function Authenticator(props: { children?: ReactNode; components: { Header: () => ReactNode; Footer: () => ReactNode } }) {
  authFixture.props = props;
  return <>{props.children}</>;
}
