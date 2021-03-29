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
        const chunkResults = await Promise.all(_.map(chunkItems, (item, i) => callbackFn(item, i)));
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

Date.prototype.stdTimezoneOffset = function () {
    var jan = new Date(this.getFullYear(), 0, 1);
    var jul = new Date(this.getFullYear(), 6, 1);
    return Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
}

Date.prototype.isDstObserved = function () {
    return this.getTimezoneOffset() < this.stdTimezoneOffset();
}

function isDST(date = new Date()) {
    return date.isDstObserved();
}

module.exports = {
    batchPromiseAll,
    wait,
    isDST
};
