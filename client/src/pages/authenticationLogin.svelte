<script>
    import Languages from '../components/languages.svelte';
    import FormAuthentication from '../components/formAuthentication.svelte';
    import { t } from '../i18n/i18n';
    import GenericBtn from '../components/genericBtn.svelte';
    import { useNavigate } from 'svelte-navigator';

    const navigate = useNavigate();
    function signup() {
        navigate('/signup');
    }
</script>

<div>
    <h4>{$t('login')}</h4>
    <FormAuthentication />
    <p>
        {$t('signupMessage')}<span
            class="text-secondary-500"
            style="cursor:pointer"
            on:click={() => signup()}>{' '}{$t('signup')}</span
        >
    </p>
    <GenericBtn testid="login-btn" methodBtn="login" colorBtn="success" textBtn="login" />
    <Languages />
</div>
