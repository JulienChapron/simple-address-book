<script>
    import { contact, key } from '../stores';
    import { useNavigate } from 'svelte-navigator';
    import { Button } from 'smelte';
    import GenericBtn from '../components/genericBtn.svelte';
    import { base_url_image } from '../../environment';
    import { t } from '../i18n/i18n';

    const navigate = useNavigate();
    let apiUrlImage = base_url_image;

    function updateContact() {
        navigate('/contact-form');
        $contact = $contact;
        $key = 'PUT';
    }
</script>

<div data-testid="contact-component">
    <div style="display:flex;justify-content:center;">
        <GenericBtn
            iconBtn="cancel"
            testid="cancel-btn"
            methodBtn="cancelContact"
            colorBtn="black"
            textBtn="cancel"
        />
        <GenericBtn
            iconBtn="delete"
            testid="delete-btn"
            methodBtn="deleteContact"
            colorBtn="error"
            textBtn="delete"
            keyBtn="big"
            data={$contact}
        />
        <Button
            data-testid="update-button"
            on:click={updateContact}
            icon="create"
            style="background-color:#fca311">{$t('update')}</Button
        >
    </div>
    <div style="width:100%;padding:5px 40px 40px 40px;">
        <div style="border-radius:5px; border:grey 1px solid;">
            <div style="padding:20px;background:#fff;border-radius: 5px 5px 0px 0px">
                <img
                    style="width:100px; height:100px; border-radius:100%;margin:auto;"
                    alt="avatar"
                    src={apiUrlImage + $contact.avatar}
                />
            </div>
            <div style="padding:20px;">
                <div style="margin-top:15px;">
                    <Button class="contact-btn" color="black" text light flat icon="person" />
                    <p>{$contact.firstname}{' '}{$contact.lastname}</p>
                </div>
                <p style="margin-top:15px;">
                    <Button
                        class="contact-btn"
                        color="black"
                        text
                        light
                        flat
                        icon="email"
                    />{$contact.email}
                </p>

                <p style="margin-top:15px;">
                    <Button
                        class="contact-btn"
                        color="black"
                        text
                        light
                        flat
                        icon="phone"
                    />{$contact.mobile}
                </p>
            </div>
        </div>
    </div>
</div>
