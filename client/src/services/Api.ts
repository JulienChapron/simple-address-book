import axios from 'axios';
const apiRequest = (method, base_url, query, data, token) => {
    const headers = {
        authorization: token ? `Bearer ${token}` : '',
        'Access-Control-Allow-Origin': 'http://localhost:8877',
        'Content-Type': 'application/json'
    };
    return axios({
        url: `${base_url}${query}`,
        method: method,
        headers: headers,
        data: data,
    })
        .then(res => {
            return Promise.resolve(res.data);
        })
        .catch(err => {
            if (err.response.status === 403)
                return Promise.resolve(err.response.data.msg);
            else return Promise.reject()
        });
};
const get = (base_url, query, data, token) => apiRequest('get', base_url, query, data, token);
const post = (base_url, query, data, token) => apiRequest('post', base_url, query, data, token);
const put = (base_url, query, data, token) => apiRequest('put', base_url, query, data, token);
const deletee = (base_url, query, data, token) =>
    apiRequest('delete', base_url, query, data, token);
const API = {
    get,
    post,
    put,
    deletee,
};
export default API;
