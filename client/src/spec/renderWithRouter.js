// renderWithRouter.js
import { render } from '@testing-library/svelte';
import WrapRouter from './WrapRouter.svelte';
const renderWithRouter = (component, componentProps, routerOptions, options) =>
    render(WrapRouter, { component, componentProps, ...routerOptions }, options);
export default renderWithRouter;
