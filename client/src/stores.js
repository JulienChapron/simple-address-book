import { writable, derived } from 'svelte/store'
// state
export const contact = writable({
  _id:'',
  firstname: '',
  lastname: '',
  email: '',
  mobile: '',
  avatar: ''
})
export const authentification = writable({
  username: '',
  password: ''
})
// auth
export const auth0Client = writable({});
export const isAuthenticated = writable(false);
export const popupOpen = writable(false);
export const user = writable({isAuthenticated:false, username:'', token:''})

// api
export const messageErrorSizeContactAvatar = writable(false)
export const messageErrorBtn = writable('')
export const language = writable('en')
export const errorsFields = writable('')
export const showSnackbarCreatedContact = writable(false)
export const showSnackbarDeletedContact = writable(false)
export const showSnackbarUpdatedContact = writable(false)
export const showSnackbarErrorContact = writable(false)
export const isLoading = writable(true)
export const searchTerm = writable('')
export const contacts = writable([])
export const key = writable('create')

// mutations
export const filteredContacts = derived(
  [searchTerm, contacts],
  ([$searchTerm, $contacts]) =>
    $contacts.filter(
      contact =>
        contact.firstname.toLowerCase().includes($searchTerm.toLowerCase()) ||
        contact.lastname.toLowerCase().includes($searchTerm.toLowerCase())
    )
)
