export type ConfiguratorUIValues = Record<string, string | null | undefined>;

export type ConfiguratorUIOption = {
  value: string;
  title: string;
  subtitle?: string;
  meta?: string;
}

export type ConfiguratorUISpec<
  TUI,
  TValues extends ConfiguratorUIValues = ConfiguratorUIValues,
> = {
  initial: TValues;
  initialValuesFromResourceUrl?(context: {
    resourceUrl: string;
    resourceUrlPattern: string;
    ui: TUI;
  }): Partial<TValues> | Promise<Partial<TValues>>;
  isReady?(context: { values: TValues }): boolean;
  resourceUrl(context: { values: TValues; ui: TUI }): Promise<string> | string;
  render(context: {
    values: TValues;
    setValues(values: Partial<TValues>): void;
    ui: TUI;
  }): unknown;
}

export function Section(_props: { title?: string | null; children?: unknown }): unknown;
export function Field(_props: {
  label: string;
  description?: string;
  optional?: boolean;
  children?: unknown;
}): unknown;
export function Autocomplete(_props: {
  name: string;
  value?: string | null;
  placeholder: string;
  loadOptions(query: string): Promise<ConfiguratorUIOption[]>;
  onChange(value: string | null): void;
}): unknown;
export function h(_component: unknown, _props: unknown, ..._children: unknown[]): unknown;

declare global {
  namespace JSX {
    type Element = unknown;
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicElements {
      [tagName: string]: unknown;
    }
  }
}
