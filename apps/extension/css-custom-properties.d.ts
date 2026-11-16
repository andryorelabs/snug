export type CssCustomPropertyName = `--${string}`;

declare module "react" {
  interface CSSProperties {
    // oxlint-disable-next-line typescript/consistent-indexed-object-style -- module augmentation of a library interface
    [customProperty: CssCustomPropertyName]: string | number | undefined;
  }
}
