<script>
    import { TextField } from 'smelte';
    import { t } from '../i18n/i18n';
    import GenericBtn from '../components/genericBtn.svelte';

    import { contact, key, messageErrorSizeContactAvatar, messageErrorBtn } from '../stores';
    import { base_url_image } from '../../environment';
    let errorFirstname = undefined,
        errorLastname = undefined,
        errorEmail = undefined,
        errorMobile = undefined,
        apiUrlImage = base_url_image,
        uploadedImage = {
            src: '',
            class: '',
            alt: '',
        };

    function changeFirstnameValue(e) {
        $contact.firstname = e.target.value;
    }
    function changeLastnameValue(e) {
        $contact.lastname = e.target.value;
    }
    function changeEmailValue(e) {
        $contact.email = e.target.value;
    }
    function changeMobileValue(e) {
        $contact.mobile = e.target.value;
    }

    function previewImage() {
        if (document.getElementById('imgfile').files[0]) {
            if (document.getElementById('imgfile').files[0].size / 1024 / 1024 > 2) {
                document.getElementById('imgfile').value = null;
                $messageErrorSizeContactAvatar = true;
            } else {
                $messageErrorSizeContactAvatar = false;
                uploadedImage.src = URL.createObjectURL(
                    document.getElementById('imgfile').files[0],
                );
                if (uploadedImage.src) {
                    uploadedImage.class = 'avatar-preview1';
                    uploadedImage.alt = 'avatar-preview';
                }
            }
        }
    }
</script>

<div class="link-div">
    <GenericBtn
        iconBtn="cancel"
        testid="cancel-btn"
        methodBtn="cancelContact"
        colorBtn="black"
        textBtn="cancel"
    />
    <GenericBtn
        iconBtn="save"
        testid="cancel-btn"
        methodBtn="validateContact"
        colorBtn="success"
        textBtn="register"
    />
</div>

<div class="avatar-div">
    <div style="margin:auto">
        {#if $key == 'POST'}
            <img style="display:none" id="uploadedImage" src="#" alt="avatar-preview" />
        {:else if uploadedImage.src}
            <img
                id="uploadedImage"
                class="avatar-preview"
                src={uploadedImage.src}
                alt="avatar-preview"
            />
        {:else}
            <img
                id="uploadedImage"
                class="avatar-preview"
                src={apiUrlImage + $contact.avatar}
                alt="avatar-preview"
            />
        {/if}

        <input
            on:change={() => previewImage()}
            type="file"
            name="file"
            id="imgfile"
            accept=".jpg, .jpeg, .png"
        />
        {#if $messageErrorSizeContactAvatar}
            <div><small class="text-error-500">Limit file upload: 2mo</small></div>
        {/if}
    </div>
    <TextField
        error={errorFirstname}
        type="text"
        placeholder={$t('firstname')}
        on:input={changeFirstnameValue}
        value={$contact.firstname}
    />
    <TextField
        error={errorLastname}
        type="text"
        placeholder={$t('lastname')}
        on:input={changeLastnameValue}
        value={$contact.lastname}
    />
    <TextField
        error={errorEmail}
        type="email"
        placeholder={$t('email')}
        on:input={changeEmailValue}
        value={$contact.email}
    />
    <TextField
        error={errorMobile}
        type="tel"
        placeholder={$t('mobile')}
        on:input={changeMobileValue}
        value={$contact.mobile}
    />
</div>
{#if $messageErrorBtn}
    <p class="text-error-500">{$messageErrorBtn}</p>
{/if}
