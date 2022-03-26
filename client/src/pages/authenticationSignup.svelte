<script>
    import { t } from '../i18n/i18n';
    import FormAuthentication from '../components/formAuthentication.svelte';
    import { useNavigate } from 'svelte-navigator';
    import GenericBtn from '../components/genericBtn.svelte';
    const navigate = useNavigate();
    function login() {
        navigate('/');
    }
</script>

<main>
    <h4>{$t('signup')}</h4>
    <p>
        {$t('loginMessage')}<span
            class="text-secondary-500"
            style="cursor:pointer"
            on:click={() => login()}>{' '}{$t('login')}</span
        >
    </p>
    <FormAuthentication />
    <GenericBtn testid="signup-btn" methodBtn="signup" colorBtn="success" textBtn="signup" />
</main>
