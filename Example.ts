import {
    Queue,
    Task
} from './src';
import * as Redis from 'redis';




async function main() {
    const redisClient = Redis.createClient('redis://127.0.0.1:6379/0');
    const queue = new Queue(redisClient, 'test');
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
            })
    }, 1000);

    while (1) {
        const task = await queue.fetch();
        console.log('fetched', task.id, task['data']);
        await queue.acknowledge(task, true);
    }
}

main()
.catch(e => {
    console.log(e.stack || e);
})
