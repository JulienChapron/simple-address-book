<script>
    import { t } from '../i18n/i18n';
    import {
        showSnackbarDeletedContact,
        showSnackbarCreatedContact,
        showSnackbarUpdatedContact,
        showSnackbarErrorContact,
    } from '../stores';
    import { Snackbar } from 'smelte';
</script>

<Snackbar color="success" top bind:value={$showSnackbarCreatedContact}>
    <div>{$t('contactCreateToast')}</div>
</Snackbar>
<Snackbar color="success" top bind:value={$showSnackbarDeletedContact}>
    <div>{$t('contactDeleteToast')}</div>
</Snackbar>
<Snackbar color="success" top bind:value={$showSnackbarUpdatedContact}>
    <div>{$t('contactUpdateToast')}</div>
</Snackbar>
<Snackbar color="error" top bind:value={$showSnackbarErrorContact}>
    <div>{$t('error')}</div>
</Snackbar>
