import { PRODUCT_NAME, THEME_COLOR } from "./identity.js";

export const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="${PRODUCT_NAME}">
  <rect width="32" height="32" rx="8" fill="${THEME_COLOR}"/>
  <text x="16" y="22" text-anchor="middle" fill="#fff8f2" font-size="16" font-family="ui-serif, Georgia, serif">D</text>
</svg>`;

export const MARK_PATH = "/dshscaffold/mark.svg";
export const MANIFEST_PATH = "/dshscaffold/manifest.webmanifest";

export const MANIFEST = {
  id: "/",
  name: PRODUCT_NAME,
  short_name: PRODUCT_NAME,
  start_url: "/",
  scope: "/",
  display: "fullscreen",
  theme_color: THEME_COLOR,
  icons: [{ src: MARK_PATH, sizes: "any", type: "image/svg+xml", purpose: "any" }],
};
