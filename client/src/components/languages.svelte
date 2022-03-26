<script>
    import { Select } from 'smelte';
    import { locale, t } from '../i18n/i18n';
    const items = [
        { value: 'en', text: 'en' },
        { value: 'fr', text: 'fr' },
    ];
    function changeLocale(event) {
        $locale = event.detail;
    }
</script>

<div style="width: fit-content;margin-left:auto;margin-right:auto;" class="mt-5">
    <Select color="secondary" label={$t('languages')} {$locale} {items} on:change={changeLocale} />
</div>
