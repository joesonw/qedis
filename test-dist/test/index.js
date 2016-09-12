"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const src_1 = require('../src');
const Redis = require('redis');
const ava_1 = require('ava');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
ava_1.default('handle queue task', (t) => __awaiter(this, void 0, void 0, function* () {
    const redisClient = Redis.createClient('redis://127.0.0.1:6379/0');
    const queue = new src_1.Queue(redisClient, 'test');
    queue.start();
    for (let i = 0; i < 10; i++) {
        yield queue.add({
            id: i.toString(),
            ['data']: i,
        });
    }
    for (let i = 0; i < 10; i++) {
        const task = yield queue.fetch();
        t.is(task['data'].toString(), task.id);
        yield queue.acknowledge(task, true);
    }
}));
//# sourceMappingURL=index.js.map