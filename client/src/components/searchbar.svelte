<script>
    import { TextField } from 'smelte';
    import { searchTerm } from '../stores';
    import { t } from '../i18n/i18n';

    let val = '';
    $: searchTerm.set(val);
</script>

<TextField color="black" bind:value={val} label={$t('search')} />
