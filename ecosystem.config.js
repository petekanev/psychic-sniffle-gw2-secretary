module.exports = {
    apps: [{
        name: 'api',
        script: 'index.js',
        watch: '.'
    }, {
        name: 'worker',
        script: './worker/worker.js',
        watch: ['utils.js', '/worker', '/data']
    }]
};
