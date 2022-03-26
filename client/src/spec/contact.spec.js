import Contact from '../components/contact.svelte';
import renderWithRouter from './renderWithRouter';
import { get } from 'svelte/store';
import { contact, key } from '../stores';
/* eslint-disable */

describe('contact.svelte', () => {
    it('1.should render contact component', () => {
        const { getByTestId } = renderWithRouter(Contact);
        const element = getByTestId('contact-component');
        expect(element).not.toBeNull();
    });
    it('2.should render cancel button', () => {
        const { getByTestId } = renderWithRouter(Contact);
        const element = getByTestId('cancel-button');
        expect(element).not.toBeNull();
    });
    it('3.should render delete button', () => {
        const { getByTestId } = renderWithRouter(Contact);
        const element = getByTestId('delete-button-component');
        expect(element).not.toBeNull();
    });
    it('4.should render update button', () => {
        const { getByTestId } = renderWithRouter(Contact);
        const element = getByTestId('update-button');
        expect(element).not.toBeNull();
    });
    it('5.init contact store', () => {
        const value = get(contact);
        expect(value).toEqual({
            _id: '',
            avatar: '',
            email: '',
            firstname: '',
            lastname: '',
            mobile: '',
        });
    });
    it('6.init key store', () => {
        const value = get(key);
        expect(value).toEqual('create');
    });
});
