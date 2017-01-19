import * as Redis from 'redis';
import * as Q from 'q';
import Interval from 'interval.ts';
import Task from './Task';

class Queue<T extends Task> {
    private redis: Redis.RedisClient;
    private queue: string;

    private interval: number = 0; //current interval till next pull (ms)
    private maxInterval: number = 1000; //max interval (ms)
    private initialInterval: number = 1; // initial interval after data received (ms)
    private step: number = 100;
    private retryTimeout: number = 10000

    private runner: Interval;
    private TConstructor: new () => T;

    private taskQueue: Array<T> = [];
    private listeners: Array<Q.Deferred<T>> = [];

    constructor(redis: Redis.RedisClient, queue: string, t_constructor: new () =>T) {
        this.queue = queue;
        this.redis = redis;
        this.runner = new Interval(() => this.run(), this.interval);
        this.TConstructor = t_constructor
        this.runner.on('error', err => {
        });
    }

    public async add(task: T): Promise<void> {
        const queue = this.queue;
        const item: Array<number | string | boolean> = [];
        task.updatedAt = task.updatedAt || new Date();
        task.createdAt = task.createdAt || new Date();
        item.push('id', task.id);
        item.push('updatedAt', task.updatedAt.getTime().toString());
        item.push('createdAt', task.createdAt.getTime().toString());
        const fields = task.fields;
        for (const key in fields) {
            item.push(key, fields[key]);
        }
        while (1) {
            try {
                return new Promise<void>((resolve, reject) => {
                    this.redis
                        .multi()
                        .lpush(`queue:${queue}`, task.id)
                        .hmset(`item:${queue}:${task.id}`, item)
                        .exec(err => {
                            if (err) return reject(err);
                            resolve();
                        });
                });
            } catch (e) {
                continue;
            }
        }
    }

    private parseTask(result): T {
        const rawFields: {[key: string] : string } = {};
        for (let i = 0; i < result.length; i += 2) {
            rawFields[result[i]] = result[i + 1];
        }

        const task = new this.TConstructor()
        const fields = {};

        for (const key in rawFields) {
            if (key === 'id') {
                task.id = rawFields[key] as string;
            } else if (key === 'createdAt') {
                task.createdAt= new Date(parseInt(rawFields[key], 10));
            } else if (key === 'updatedAt') {
                task.updatedAt = new Date(parseInt(rawFields[key], 10));
            } else {
                fields[key] = rawFields[key];
            }
        }
        task.fields = fields;
        return task;
    }

    private async fetchPending(): Promise<T> {
        const queue = this.queue;
        return new Promise<T>((resolve, reject) => {
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
                    if (err) return reject(err);
                    if (!res) return resolve(null);
                    resolve(this.parseTask(res));
                });
        });
    }

    private async fetchQueue(): Promise<T> {
        const queue = this.queue;
        return new Promise<T>((resolve, reject) => {
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
                    if (err) return reject(err);
                    if (!res) return resolve(null);
                    resolve(this.parseTask(res));
                })
        })
    }

    private async run(): Promise<void> {
        let task = await this.fetchPending();
        if (!task) {
            task = await this.fetchQueue();
        }

        if (!task) {
            this.interval = Math.min(this.interval + this.step, this.maxInterval);
            this.runner.adjust(this.interval);
            return;
        }

        const d = this.listeners.pop();
        if (d) {
            d.resolve(task);
        } else {
            this.taskQueue.push(task);
        }
        this.interval = this.initialInterval;
        this.runner.adjust(this.interval);
    }

    async fetch(): Promise<T> {
        const task = this.taskQueue.pop();
        if (task) {
            return Promise.resolve(task);
        } else {
            const d = Q.defer<T>();
            this.listeners.push(d);
            return d.promise;
        }
    }

    public async acknowledge(task: Task, deleteOriginal: boolean = false): Promise<void> {
        const queue = this.queue;
        let i = 0;
        while (i < 10) {
            try {
                return new Promise<void>((resolve, reject) => {
                    let exec = this.redis
                        .multi()
                        .lrem(`pending:${queue}`, 0, task.id);
                    if (deleteOriginal) {
                        exec = exec
                                .del(`item:${queue}:${task.id}`);
                    }
                    exec.exec(err => {
                            if (err) return reject(err);
                            resolve();
                        });
                });
            } catch (e) {
                i++;
            }
        }
    }

    start() {
        this.runner.start();
    }

    stop() {
        this.runner.stop();
    }

    setMaxInterval(interval: number) {
        this.maxInterval = interval;
    }

    setInitialInterval(interval: number) {
        this.initialInterval = Math.max(interval, 0);
    }

    setStep(interval: number) {
        this.step = interval;
    }

    setRetryTimeout(timeout: number) {
        this.retryTimeout = timeout;
    }

    setInterval(interval: number) {
        this.interval = interval;
        this.runner.adjust(interval);
    }
}

export default Queue;
