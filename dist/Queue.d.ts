import * as Redis from 'redis';
import Task from './Task';
declare class Queue {
    private redis;
    private queue;
    private interval;
    private maxInterval;
    private initialInterval;
    private step;
    private retryTimeout;
    private runner;
    private taskQueue;
    private listeners;
    constructor(redis: Redis.RedisClient, queue: string);
    add(task: Task): Promise<void>;
    private fetchPending();
    private fetchQueue();
    private run();
    fetch(): Promise<Task>;
    acknowledge(task: Task): Promise<void>;
    start(): void;
    stop(): void;
    setMaxInterval(interval: number): void;
    setInitialInterval(interval: number): void;
    setStep(interval: number): void;
    setRetryTimeout(timeout: number): void;
    setInterval(interval: number): void;
}
export default Queue;
