import { Autocomplete, Field, h, Section, type ConfiguratorUISpec } from "@gadgets/configurator-ui";
import type {
  CollectionConfiguratorRpc,
  CollectionConfiguratorValues,
} from "./collection-configurator-types";

export default {
  initial: {},

  isReady({ values }) {
    return typeof values.collectionUrl === "string" && values.collectionUrl.length > 0;
  },

  initialValuesFromResourceUrl({ resourceUrl }) {
    return resourceUrl ? { collectionUrl: resourceUrl } : {};
  },

  resourceUrl({ values }) {
    return values.collectionUrl ?? "";
  },

  render({ values, setValues, ui }) {
    return <Section>
      <Field
        label="コレクション"
        description="アクセス権のあるコレクションから選択します。"
      >
        <Autocomplete
          name="collectionUrl"
          value={values.collectionUrl}
          placeholder="名前・説明・タグで検索"
          loadOptions={query => ui.listCollections(query)}
          onChange={collectionUrl => setValues({ collectionUrl })}
        />
      </Field>
    </Section>;
  },
} satisfies ConfiguratorUISpec<CollectionConfiguratorRpc, CollectionConfiguratorValues>;
