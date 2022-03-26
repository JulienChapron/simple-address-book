<script>
    import { onMount } from 'svelte';
    import { useNavigate } from 'svelte-navigator';
    const navigate = useNavigate();
    onMount(async () => {
        navigate('/');
    });
</script>

<main class="mt-10">
    <h5>error 404</h5>
    <h2>Page not found</h2>
</main>
