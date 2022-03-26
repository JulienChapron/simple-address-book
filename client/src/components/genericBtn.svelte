<script>
    import { Button, Dialog, Tooltip } from 'smelte';
    import { t } from '../i18n/i18n';
    import {
        authentification,
        user,
        messageErrorBtn,
        key,
        contact,
        showSnackbarCreatedContact,
        contacts,
        showSnackbarUpdatedContact,
        messageErrorSizeContactAvatar,
        showSnackbarDeletedContact,
    } from '../stores';
    import { postLogin, postSignup } from '../services/authJwt.ts';
    import { deleteContact, postContact, updateContact } from '../services/contact.ts';
    import { useNavigate } from 'svelte-navigator';

    // props
    export let textBtn = undefined,
        iconBtn = undefined,
        colorBtn = undefined,
        methodBtn = undefined,
        testid = undefined,
        keyBtn = undefined,
        data = undefined;

    // initialization
    const navigate = useNavigate();
    let showDialog = false;
    let formData = new FormData();
    let response = undefined;

    async function genericMethod() {
        switch (methodBtn) {
            case 'signup':
                formData.append('username', $authentification.username);
                formData.append('password', $authentification.password);
                response = await postSignup(formData);
                if (response.success) {
                    $messageErrorBtn = '';
                    //$user = response.data;
                    navigate('/');
                } else {
                    $messageErrorBtn = response;
                }
                break;
            case 'login':
                formData.append('username', $authentification.username);
                formData.append('password', $authentification.password);
                response = await postLogin(formData);
                if (response.success) {
                    $messageErrorBtn = '';
                    $user = response.data;
                } else {
                    $messageErrorBtn = response;
                }

                break;
            case 'addContact':
                navigate('/contact-form');
                $key = 'POST';
                $contact = {
                    _id: '',
                    firstname: '',
                    lastname: '',
                    email: '',
                    mobile: '',
                    avatar: '',
                };
                break;
            case 'cancelContact':
                navigate('/');
                break;
            case 'deleteContact':
                showDialog = true;
                $contact = data;
                break;
            case 'updateContact':
                $contact = data;
                navigate('/contact-form');
                $key = 'PUT';
                break;
            case 'logout':
                $user = '';
                navigate('/');
                break;
            case 'validateContact':
                $messageErrorBtn = '';
                // if uploaded image
                if (document.getElementById('imgfile').files[0]) {
                    if (document.getElementById('imgfile').files[0].size / 1024 / 1024 > 2) {
                        document.getElementById('imgfile').value = null;
                        $messageErrorSizeContactAvatar = true;
                    } else {
                        $messageErrorSizeContactAvatar = false;
                        var reader = new FileReader();
                        reader.readAsDataURL(document.getElementById('imgfile').files[0]);
                        reader.onload = async function () {
                            let formData = new FormData();
                            formData.append('avatar', reader.result);
                            formData.append('firstname', $contact.firstname);
                            formData.append('lastname', $contact.lastname);
                            formData.append('email', $contact.email);
                            formData.append('mobile', $contact.mobile);
                            formData.append('userId', $user._id);
                            if ($key === 'POST') {
                                const response = await postContact($user.token, formData);
                                if (!response.error) {
                                    $contacts.push(response.data);
                                    $contacts = $contacts.sort();
                                    $showSnackbarCreatedContact = true;
                                    navigate('/');
                                } else if (response.msg) {
                                    $messageErrorBtn = response.msg;
                                }
                            } else if ($key === 'PUT') {
                                const response = await updateContact(
                                    $user.token,
                                    $contact._id,
                                    formData,
                                );
                                if (!response.msg) {
                                    $contacts.forEach((element, index) => {
                                        if (element.id === response.data._id) {
                                            $contacts[index] = response;
                                        }
                                    });
                                    $showSnackbarUpdatedContact = true;
                                    navigate('/');
                                } else if (response.msg) {
                                    $messageErrorBtn = response.msg;
                                }
                            }
                        };
                    }
                } else {
                    let formData = new FormData();
                    formData.append('avatar', $contact.avatar);
                    formData.append('firstname', $contact.firstname);
                    formData.append('lastname', $contact.lastname);
                    formData.append('email', $contact.email);
                    formData.append('mobile', $contact.mobile);
                    formData.append('userId', $user._id);
                    if ($key === 'POST') {
                        const response = await postContact($user.token, formData);
                        if (!response.error) {
                            $contacts.push(response.data);
                            $contacts = $contacts.sort();
                            $showSnackbarCreatedContact = true;
                            navigate('/');
                        } else if (response.error) {
                            $messageErrorBtn = response.msg;
                        }
                    } else if ($key === 'PUT') {
                        const response = await updateContact($user.token, $contact._id, formData);
                        if (!response.error) {
                            $contacts.forEach((element, index) => {
                                if (element.id === response.data._id) {
                                    $contacts[index] = response;
                                }
                            });
                            $showSnackbarUpdatedContact = true;
                            navigate('/');
                        } else if (response.msg) {
                            $messageErrorBtn = response.msg;
                        }
                    }
                }
        }
    }
    async function deleteContactConfirmation() {
        const id = $contact._id;
        const response = await deleteContact($user.token, $contact._id, $contact.avatar);
        if (response) {
            showDialog = !showDialog;
            $contacts = $contacts.filter(contact => contact._id !== id);
            $showSnackbarDeletedContact = true;
            navigate('/');
        }
    }
</script>

<div>
    <Dialog color="#000" bind:value={showDialog}>
        <h5 slot="title">{$t('deleteContactConfirmationMessage')}</h5>
        <div data-testid="delete-component-dialog" slot="actions">
            <Button
                color="black"
                data-testid="confirmation-dialog-no"
                text
                on:click={() => (showDialog = false)}>{$t('no')}</Button
            >
            <Button
                color="black"
                data-testid="confirmation-dialog-yes"
                text
                on:click={() => deleteContactConfirmation()}>{$t('yes')}</Button
            >
        </div>
    </Dialog>
    <Tooltip>
        <div slot="activator">
            {#if keyBtn == undefined || keyBtn === 'big'}
                <Button
                    class="is-centered"
                    data-testid={testid ? testid : null}
                    color={colorBtn ? colorBtn : null}
                    icon={iconBtn ? iconBtn : null}
                    on:click={() => genericMethod()}>{$t(`${textBtn}`)}</Button
                >
            {:else}
                <Button
                    class="is-centered"
                    data-testid={testid ? testid : null}
                    color={colorBtn ? colorBtn : null}
                    icon={iconBtn ? iconBtn : null}
                    light
                    text
                    flat
                    on:click={() => genericMethod()}
                />
            {/if}
        </div>
        {$t(`${textBtn}`)}</Tooltip
    >
</div>
{#if methodBtn === 'login' || methodBtn === 'signup'}
    <div>
        <p class="text-error-500">{$messageErrorBtn}</p>
    </div>
{/if}
