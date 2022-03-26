import { derived, writable } from 'svelte/store';
import translations from './translations';

export const locale = writable('en');
export const locales = [
    { value: 'en', text: 'en' },
    { value: 'fr', text: 'fr' },
];

function translate(locale, key, vars) {
    if (!key) throw new Error('no key provided to $t()');
    if (!locale) throw new Error(`no translation for key "${key}"`);

    let text = translations[locale][key];

    if (!text) throw new Error(`no translation found for ${locale}.${key}`);
    Object.keys(vars).map(k => {
        const regex = new RegExp(`{{${k}}}`, 'g');
        text = text.replace(regex, vars[k]);
    });
    return text;
}
export const t = derived(
    locale,
    $locale =>
        (key, vars = {}) =>
            translate($locale, key, vars),
);
