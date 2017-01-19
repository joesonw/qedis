"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
const Q = require("q");
const interval_ts_1 = require("interval.ts");
class Queue {
    constructor(redis, queue, t_constructor) {
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
        this.TConstructor = t_constructor;
        this.runner.on('error', err => {
        });
    }
    add(task) {
        return __awaiter(this, void 0, void 0, function* () {
            const queue = this.queue;
            const item = [];
            task.createdAt = Date.now();
            task.updatedAt = Date.now();
            item.push('id', task.id);
            item.push('updatedAt', task.updatedAt);
            item.push('createdAt', task.createdAt);
            const fields = task.fields;
            for (const key in fields) {
                item.push(key, fields[key]);
            }
            while (1) {
                try {
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
                }
                catch (e) {
                    continue;
                }
            }
        });
    }
    parseTask(result) {
        const rawFields = {};
        for (let i = 0; i < result.length; i += 2) {
            rawFields[result[i]] = result[i + 1];
        }
        const task = new this.TConstructor();
        const fields = {};
        for (const key in rawFields) {
            if (key === 'id') {
                task.id = rawFields[key];
            }
            else if (key === 'createdAt') {
                task.createdAt = parseInt(rawFields[key], 10);
            }
            else if (key === 'updatedAt') {
                task.updatedAt = parseInt(rawFields[key], 10);
            }
            else {
                fields[key] = rawFields[key];
            }
        }
        task.fields = fields;
        return task;
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
                    resolve(this.parseTask(res));
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
                    resolve(this.parseTask(res));
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
    acknowledge(task, deleteOriginal = false) {
        return __awaiter(this, void 0, void 0, function* () {
            const queue = this.queue;
            let i = 0;
            while (i < 10) {
                try {
                    return new Promise((resolve, reject) => {
                        let exec = this.redis
                            .multi()
                            .lrem(`pending:${queue}`, 0, task.id);
                        if (deleteOriginal) {
                            exec = exec
                                .del(`item:${queue}:${task.id}`);
                        }
                        exec.exec(err => {
                            if (err)
                                return reject(err);
                            resolve();
                        });
                    });
                }
                catch (e) {
                    i++;
                }
            }
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