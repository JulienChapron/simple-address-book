<!-- WrapRouter.svelte -->
<script>
    import { onDestroy } from 'svelte';
    import { Router, Route, createMemorySource, createHistory } from 'svelte-navigator';

    export let component = undefined;
    export let componentProps = undefined;
    export let onNavigate = () => {};
    export let withRoute = false;
    export let initialPathname = '/';
    const history = createHistory(createMemorySource(initialPathname));
    const unlisten = history.listen(onNavigate);
    onDestroy(unlisten);
</script>

<Router {history}>
    {#if withRoute}
        <Route path="*">
            <svelte:component this={component} {...componentProps} />
        </Route>
    {:else}
        <svelte:component this={component} {...componentProps} />
    {/if}
</Router>
