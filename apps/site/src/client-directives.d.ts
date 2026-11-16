import type * as astro from "astro";

export type AstroModule = typeof astro;

declare module "astro" {
  interface AstroClientDirectives {
    "client:interaction"?: boolean;
  }
}
