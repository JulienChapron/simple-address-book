<script>
    import { useNavigate } from 'svelte-navigator';
    import { contact } from '../stores';
    import GenericBtn from '../components/genericBtn.svelte';
    import { base_url_image } from '../../environment';
    const navigate = useNavigate();

    export let contactItem = undefined;

    function showContact(contactObj) {
        navigate('/contact');
        $contact = contactObj;
    }
    function changeBackgroundUrl(avatarUrl) {
        return `background-image:url('${base_url_image}${avatarUrl}')`;
    }
</script>

<div data-testid="contactItem-component" class="card">
    <div
        style={changeBackgroundUrl(contactItem.avatar)}
        on:click={showContact(contactItem)}
        class="avatar"
    />
    <div on:click={showContact(contactItem)} class="firstname-lastname">
        <div data-testid="contactItem-firstname-lastname" style="line-height: 25px;">
            {contactItem.firstname}{' '}{contactItem.lastname}
        </div>
        <div data-testid="contactItem-mobile" class="subheading">
            {contactItem.mobile}
        </div>
    </div>
    <div class="update-delete-btn">
        <GenericBtn
            iconBtn="edit"
            testid="update-btn"
            methodBtn="updateContact"
            colorBtn="alert"
            textBtn="update"
            keyBtn="small"
            data={contactItem}
        />
        <GenericBtn
            iconBtn="delete"
            testid="delete-btn"
            methodBtn="deleteContact"
            colorBtn="error"
            textBtn="delete"
            keyBtn="small"
            data={contactItem}
        />
    </div>
</div>
