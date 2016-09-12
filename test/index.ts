import {
    Queue,
    Task
} from '../src';
import * as Redis from 'redis';
import test from 'ava';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('handle queue task', async t => {
    const redisClient = Redis.createClient('redis://127.0.0.1:6379/0');
    const queue = new Queue(redisClient, 'test');
    queue.start();
    for (let i = 0; i < 10; i++) {
        await queue.add({
            id: i.toString(),
            ['data']: i,
        });
    }

    for (let i = 0; i < 10; i++) {
        const task = await queue.fetch();
        t.is(task['data'].toString(), task.id);
        await queue.acknowledge(task, true);
    }
});
