export type CssCustomPropertyName = `--${string}`;

declare module "react" {
  interface CSSProperties {
    [customProperty: CssCustomPropertyName]: string | number | undefined;
  }
}
