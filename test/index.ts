import {
    Queue,
    Task
} from '../src';
import * as Redis from 'redis';
import test from 'ava';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class TestTask implements Task {
    id: string;
    createdAt: number = Date.now();
    updatedAt: number = Date.now();
    data: number;
    get fields(): {[key: string] : string } {
        return {
            data: this.data.toString(),
        };
    }
    set fields(fields: {[key: string] : string }) {
        this.data = parseInt(fields['data'], 10);
    }

}

test('handle queue task', async t => {
    const redisClient = Redis.createClient('redis://127.0.0.1:6379/0');
    const queue = new Queue<TestTask>(redisClient, 'test', TestTask);
    queue.start();
    for (let i = 0; i < 10; i++) {
        const task = new TestTask();
        task.id = i.toString();
        task.data = i;
        await queue.add(task);
    }

    for (let i = 0; i < 10; i++) {
        const task = await queue.fetch();
        t.is(task.data.toString(), task.id);
        await queue.acknowledge(task, true);
    }
});
