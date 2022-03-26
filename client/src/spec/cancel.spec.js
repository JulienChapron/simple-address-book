import Cancel from '../components/cancel.svelte';
import renderWithRouter from './renderWithRouter';

/* eslint-disable */
describe('cancel.svelte', () => {
    it('should render component', () => {
        const { getByTestId } = renderWithRouter(Cancel);
        const element = getByTestId('cancel-button');
        expect(element).not.toBeNull();
    });
});
