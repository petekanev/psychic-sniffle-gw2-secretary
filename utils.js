const _ = require("lodash");

function wait(interval) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, interval);
    });
}

async function batchPromiseAll(items, callbackFn, groupSize = 5, delayMs = 1000) {
    const chunks = _.chunk(items, groupSize);
    const results = [];
    let i = 0;
    for (let chunkItems of chunks) {
        const chunkResults = await Promise.all(_.map(chunkItems, item => callbackFn(item)));
        if (_.some(chunkResults)) {
            results.push(chunkResults);
        }

        i++;
        if (delayMs > 0 && i < chunks.length) {
            await wait(delayMs);
        }
    }

    return _.flatten(results);
}

module.exports = {
    batchPromiseAll
};
