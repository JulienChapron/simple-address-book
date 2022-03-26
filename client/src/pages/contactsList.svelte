<script>
    import GenericBtn from '../components/genericBtn.svelte';
    import { getContactsList } from '../services/contact.ts';
    import { t } from '../i18n/i18n';
    import {
        user,
        filteredContacts,
        contacts,
        isLoading,
        showSnackbarErrorContact,
    } from '../stores';

    import Searchbar from '../components/searchbar.svelte';
    import GenericSnackbar from '../components/genericSnackbar.svelte';
    import ContactItem from '../components/contactItem.svelte';
    import { fade } from 'svelte/transition';
    import { ProgressLinear } from 'smelte';
    import { onMount } from 'svelte';
    onMount(async () => {
        const response = await getContactsList($user.token, $user._id);
        if (response) {
            $contacts = response;
            setTimeout(function () {
                $isLoading = false;
            }, 2000);
        } else {
            $showSnackbarErrorContact = true;
        }
    });
</script>

<GenericSnackbar />
<GenericBtn
    testid="add-contact-btn"
    methodBtn="addContact"
    colorBtn="secondary"
    textBtn="addContact"
    iconBtn="add"
/>
<Searchbar />
<div class="list">
    {#if $isLoading}
        <span transition:fade={{ duration: 2000 }}><ProgressLinear color="success" /></span>
    {:else}
        <ul transition:fade={{ duration: 1000 }}>
            {#if !$filteredContacts.length}
                <p>{$t('noContactRegistered')}</p>
            {/if}
            {#each $filteredContacts as contactItem}
                <li>
                    <ContactItem {contactItem} />
                </li>
            {/each}
        </ul>
    {/if}
</div>
