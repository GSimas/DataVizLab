/* Intl formatters are expensive to build and cheap to reuse: building one per table cell or per comparison
   showed up as a hot spot when a project opens. These return one shared formatter per locale and options. */

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.Collator>();

function shared<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.Collator>(key: string, make: () => T): T {
  let formatter = cache.get(key) as T | undefined;
  if (!formatter) { formatter = make(); cache.set(key, formatter); }
  return formatter;
}

export const numberFormat = (locale: string, options: Intl.NumberFormatOptions = {}) =>
  shared(`n|${locale}|${JSON.stringify(options)}`, () => new Intl.NumberFormat(locale, options));

export const dateFormat = (locale: string, options: Intl.DateTimeFormatOptions = {}) =>
  shared(`d|${locale}|${JSON.stringify(options)}`, () => new Intl.DateTimeFormat(locale, options));

export const collator = (locale: string, options: Intl.CollatorOptions = {}) =>
  shared(`c|${locale}|${JSON.stringify(options)}`, () => new Intl.Collator(locale, options));
