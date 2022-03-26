import Delete from '../components/delete.svelte';
import renderWithRouter from './renderWithRouter';
import { fireEvent } from '@testing-library/svelte';

/* eslint-disable */
describe('delete.svelte', () => {
    it('1.should render component', () => {
        const { getByTestId } = renderWithRouter(Delete);
        const element = getByTestId('delete-button-component');
        expect(element).not.toBeNull();
    });
    it('2.show small and big button delete -> keyBtn', async () => {
        const keyBtn = 'small';
        const { getByTestId } = renderWithRouter(Delete, { keyBtn: keyBtn });
        expect(keyBtn).toBe('small');
        const element = getByTestId('delete-button-small');
        expect(element).not.toBeNull();
    });
    it('3.show small and big button delete -> keyBtn', async () => {
        const keyBtn = 'big';
        const { getByTestId } = renderWithRouter(Delete, { keyBtn: keyBtn });
        expect(keyBtn).toBe('big');
        const element = getByTestId('delete-button-big');
        expect(element).not.toBeNull();
    });
    it('4.click on btn delete -> show dialog and close dialog', async () => {
        const keyBtn = 'big';
        const { getByTestId } = renderWithRouter(Delete, { keyBtn: keyBtn });
        const component = getByTestId('delete-button-component');
        expect(component.textContent).not.toContain('Are you sure to delete this contact ?');
        const deleteBtn = getByTestId('delete-button-big');
        await fireEvent.click(deleteBtn);
        let dialog = getByTestId('delete-component-dialog');
        expect(dialog).not.toBeNull();
    });
});
