// Test-only DOM. No Amplify configuration or real endpoints are used.
import { pathToFileURL } from "node:url";
const { JSDOM } = await import(pathToFileURL(process.env.P02_JSDOM).href);
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://synthetic.invalid" });
for (const key of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Event", "MouseEvent", "File", "FileReader", "Blob"]) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
window.matchMedia = () => ({ matches: false });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
