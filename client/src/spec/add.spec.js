import Add from '../components/genericBtn.svelte';
import renderWithRouter from './renderWithRouter';

/* eslint-disable */
describe('add.svelte', () => {
    it('should render component', () => {
        const { getByTestId } = renderWithRouter(Add);
        const element = getByTestId('add-button');
        expect(element).not.toBeNull();
    });
});
