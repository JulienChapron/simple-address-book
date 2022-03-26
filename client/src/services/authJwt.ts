import Api from './Api.ts';
import { base_url } from '../../environment.js';

export const postLogin = async data => {
    try {
        const response = await Api.post(base_url, 'login', data);
        return response;
    } catch (error) {
        console.error(error);
    }
};
export const postSignup = async data => {
    try {
        const response = await Api.post(base_url, 'signup', data);
        return response;
    } catch (error) {
        console.error(error);
    }
};
