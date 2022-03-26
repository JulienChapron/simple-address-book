import Api from './Api.ts';
import { base_url } from '../../environment.js';

// actions like store Vuex
export const getContactsList = async (token, userId) => {
    try {
        const response = await Api.get(base_url, `contacts/${userId}`, undefined, token);
        return JSON.parse(JSON.stringify(response.data)).sort((a, b) =>
            a.firstname.localeCompare(b.firstname),
        );
    } catch (error) {
        console.error(error);
    }
};
export const postContact = async (token, data) => {
    try {
        const response = await Api.post(base_url, 'contact', data, token);
        return response;
    } catch (error) {
        console.error(error);
    }
};
export const updateContact = async (token, idContact, data) => {
    try {
        const response = await Api.put(base_url, `contact/${idContact}`, data, token);
        return response;
    } catch (error) {
        console.error(error);
    }
};
export const deleteContact = async (token, idContact, urlAvatar) => {
    try {
        const response = await Api.deletee(base_url, `contact/${idContact}`, urlAvatar, token);
        return response;
    } catch (error) {
        console.error(error);
    }
};
