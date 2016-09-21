import * as Redis from 'redis';
import * as Q from 'q';
import Interval from 'interval.ts';
import Task, {Primitive} from './Task';

class Queue {
    private redis: Redis.RedisClient;
    private queue: string;

    private interval: number = 0; //current interval till next pull (ms)
    private maxInterval: number = 1000; //max interval (ms)
    private initialInterval: number = 1; // initial interval after data received (ms)
    private step: number = 100;
    private retryTimeout: number = 10000

    private runner: Interval;

    private taskQueue: Array<Task> = [];
    private listeners: Array<Q.Deferred<Task>> = [];

    constructor(redis: Redis.RedisClient, queue: string) {
        this.queue = queue;
        this.redis = redis;
        this.runner = new Interval(() => this.run(), this.interval);
        this.runner.on('error', err => {
        });
    }

    public async add(task: Task): Promise<void> {
        const queue = this.queue;
        const item: Array<Primitive> = [];
        task.createdAt = Date.now();
        task.updatedAt = Date.now();
        for (const key in task) {
            item.push(key, task[key]);
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

    private async fetchPending(): Promise<Task> {
        const queue = this.queue;
        return new Promise<Task>((resolve, reject) => {
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
                    let result: Task = {} as Task;
                    for (let i = 0; i < res.length; i += 2) {
                        result[res[i]] = res[i + 1];
                    }
                    resolve(result);
                });
        });
    }

    private async fetchQueue(): Promise<Task> {
        const queue = this.queue;
        return new Promise<Task>((resolve, reject) => {
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
                    let result: Task = {} as Task;
                    for (let i = 0; i < res.length; i += 2) {
                        result[res[i]] = res[i + 1];
                    }
                    resolve(result);
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

    async fetch(): Promise<Task> {
        const task = this.taskQueue.pop();
        if (task) {
            return Promise.resolve(task);
        } else {
            const d = Q.defer<Task>();
            this.listeners.push(d);
            return d.promise;
        }
    }

    public async acknowledge(task: Task, deleteOriginal: boolean = false): Promise<void> {
        const queue = this.queue;
        return new Promise< void >((resolve, reject) => {
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
        })
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
