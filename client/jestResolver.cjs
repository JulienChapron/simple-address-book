module.exports = (request, options) => {
    if (request === 'svelte-navigator') {
        request = 'svelte-navigator/src';
    }

    return options.defaultResolver(request, options);
};