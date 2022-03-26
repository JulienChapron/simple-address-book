<script>
    import { t } from '../i18n/i18n';
    import { authentification } from '../stores';
    import { TextField } from 'smelte';
    function changeUsernameValue(e) {
        $authentification.username = e.target.value;
    }
    function changePasswordValue(e) {
        $authentification.password = e.target.value;
    }
</script>

<div>
    <h6 class="mb-3 mt-6">{$t('username')}</h6>
    <TextField
        on:input={changeUsernameValue}
        value={$authentification.username}
        type="text"
        label={$t('username')}
    />
    <h6 class="mb-3 mt-6">{$t('password')}</h6>
    <TextField
        on:input={changePasswordValue}
        value={$authentification.password}
        type="password"
        label={$t('password')}
    />
</div>
