"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const Q = require('q');
const interval_ts_1 = require('interval.ts');
class Queue {
    constructor(redis, queue) {
        this.interval = 0; //current interval till next pull (ms)
        this.maxInterval = 1000; //max interval (ms)
        this.initialInterval = 1; // initial interval after data received (ms)
        this.step = 100;
        this.retryTimeout = 10000;
        this.taskQueue = [];
        this.listeners = [];
        this.queue = queue;
        this.redis = redis;
        this.runner = new interval_ts_1.default(() => this.run(), this.interval);
        this.runner.on('error', err => {
        });
    }
    add(task) {
        return __awaiter(this, void 0, void 0, function* () {
            const queue = this.queue;
            const item = [];
            task.createdAt = Date.now();
            task.updatedAt = Date.now();
            for (const key in task) {
                item.push(key, task[key]);
            }
            return new Promise((resolve, reject) => {
                this.redis
                    .multi()
                    .lpush(`queue:${queue}`, task.id)
                    .hmset(`item:${queue}:${task.id}`, item)
                    .exec(err => {
                    if (err)
                        return reject(err);
                    resolve();
                });
            });
        });
    }
    fetchPending() {
        return __awaiter(this, void 0, void 0, function* () {
            const queue = this.queue;
            return new Promise((resolve, reject) => {
                const now = Date.now();
                this.redis.eval(`
                    local ids = redis.call(
                            "sort",
                            "pending:${queue}",
                            "by", "item:${queue}:*->updatedAt",
                            "limit", "0", "1");
                    local id = ids[1];
                    if id == nil then
                        return nil;
                    end
                    local task = redis.call("hgetall", "item:${queue}:" .. id);
                    local length = table.getn(task)
                    local date = "";
                    for i = 1, length do
                        if task[i] == "updatedAt" then
                            date = task[i + 1];
                        end
                    end
                    if date then
                        if ${now} - tonumber(date) >= ${this.retryTimeout} then
                            redis.call("hset", "item:${queue}:" .. id, "updatedAt", ${now});
                            return task;
                        end
                    end
                    return nil;
                `, 0, (err, res) => {
                    if (err)
                        return reject(err);
                    if (!res)
                        return resolve(null);
                    let result = {};
                    for (let i = 0; i < res.length; i += 2) {
                        result[res[i]] = res[i + 1];
                    }
                    resolve(result);
                });
            });
        });
    }
    fetchQueue() {
        return __awaiter(this, void 0, void 0, function* () {
            const queue = this.queue;
            return new Promise((resolve, reject) => {
                const now = Date.now();
                this.redis.eval(`
                    local id = redis.call("rpop", "queue:${queue}");
                    if id == false then
                        return nil;
                    end
                    redis.call("hset", "item:${queue}:" .. id, "updatedAt", ${now});
                    local task = redis.call("hgetall", "item:${queue}:" .. id);
                    if (table.getn(task) == 0) then
                        return nil;
                    end
                    redis.call("lpush", "pending:${queue}", id);
                    return task;
                `, 0, (err, res) => {
                    if (err)
                        return reject(err);
                    if (!res)
                        return resolve(null);
                    let result = {};
                    for (let i = 0; i < res.length; i += 2) {
                        result[res[i]] = res[i + 1];
                    }
                    resolve(result);
                });
            });
        });
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            let task = yield this.fetchPending();
            if (!task) {
                task = yield this.fetchQueue();
            }
            if (!task) {
                this.interval = Math.min(this.interval + this.step, this.maxInterval);
                this.runner.adjust(this.interval);
                return;
            }
            const d = this.listeners.pop();
            if (d) {
                d.resolve(task);
            }
            else {
                this.taskQueue.push(task);
            }
            this.interval = this.initialInterval;
            this.runner.adjust(this.interval);
        });
    }
    fetch() {
        return __awaiter(this, void 0, void 0, function* () {
            const task = this.taskQueue.pop();
            if (task) {
                return Promise.resolve(task);
            }
            else {
                const d = Q.defer();
                this.listeners.push(d);
                return d.promise;
            }
        });
    }
    acknowledge(task) {
        return __awaiter(this, void 0, void 0, function* () {
            const queue = this.queue;
            return new Promise((resolve, reject) => {
                this.redis
                    .lrem(`pending:${queue}`, 0, task.id, err => {
                    if (err)
                        return reject(err);
                    resolve();
                });
            });
        });
    }
    start() {
        this.runner.start();
    }
    stop() {
        this.runner.stop();
    }
    setMaxInterval(interval) {
        this.maxInterval = interval;
    }
    setInitialInterval(interval) {
        this.initialInterval = Math.max(interval, 0);
    }
    setStep(interval) {
        this.step = interval;
    }
    setRetryTimeout(timeout) {
        this.retryTimeout = timeout;
    }
    setInterval(interval) {
        this.interval = interval;
        this.runner.adjust(interval);
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Queue;
//# sourceMappingURL=Queue.js.map