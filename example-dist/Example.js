"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const src_1 = require('./src');
const Redis = require('redis');
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const redisClient = Redis.createClient('redis://127.0.0.1:6379/0');
        const queue = new src_1.Queue(redisClient, 'test');
        queue.start();
        let i = 0;
        setInterval(() => {
            const task = {
                id: (i++).toString(),
                data: Math.random(),
            };
            queue
                .add(task)
                .then(() => {
                console.log(`${task.id} added`);
            });
        }, 1000);
        while (1) {
            const task = yield queue.fetch();
            console.log('fetched', task.id, task.data);
            yield queue.acknowledge(task, true);
        }
    });
}
main()
    .catch(e => {
    console.log(e.stack || e);
});
//# sourceMappingURL=Example.js.map