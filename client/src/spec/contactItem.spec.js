import ContactItem from '../components/contactItem.svelte';
import renderWithRouter from './renderWithRouter';

/* eslint-disable */
describe('contactItem.svelte', () => {
    const contactItem = {
        _id: '1',
        avatar: '',
        email: 'johndoe@email.com',
        firstname: 'John',
        lastname: 'Doe',
        mobile: '0988776655',
    };
    it('1.should render contactItem component', () => {
        const { getByTestId } = renderWithRouter(ContactItem, { contactItem: contactItem });
        const element = getByTestId('contactItem-component');
        expect(element).not.toBeNull();
    });
    it('2.test value Props contactItem', () => {
        const { getByTestId } = renderWithRouter(ContactItem, { contactItem: contactItem });
        const element = getByTestId('contactItem-component');
        expect(element).not.toBeNull();
        expect(contactItem.email).toBe('johndoe@email.com');
        expect(contactItem.firstname).toBe('John');
        expect(contactItem.lastname).toBe('Doe');
        expect(contactItem._id).toBe('1');
        expect(contactItem.mobile).toBe('0988776655');
    });
    it('3.should render delete button', () => {
        const { getByTestId } = renderWithRouter(ContactItem, { contactItem: contactItem });
        const element = getByTestId('delete-button-component');
        expect(element).not.toBeNull();
    });
    it('4.should render update button', () => {
        const { getByTestId } = renderWithRouter(ContactItem, { contactItem: contactItem });
        const element = getByTestId('update-button');
        expect(element).not.toBeNull();
    });
    it('5.should render text value from props mobile', () => {
        const { getByTestId } = renderWithRouter(ContactItem, { contactItem: contactItem });
        const element = getByTestId('contactItem-mobile');
        expect(element.textContent).toBe('0988776655');
    });
    it('6.should render text value from props firstname lastname', () => {
        const { getByTestId } = renderWithRouter(ContactItem, { contactItem: contactItem });
        const element = getByTestId('contactItem-firstname-lastname');
        expect(element.textContent).toBe('John Doe');
    });
});
