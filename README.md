#Introduction
This is a distributable queue for redis. It has At-Least-One consistency. You can setup your workers on multiple nodes. Its compatible with __typescript 2.0 +__

#Example
> see `Example.ts`

#Classes

##Queue
###constructor(Redis.RedisClient, string)
> It takes a redis client and a string as the queue name.

###async add(Task): Promise\<void\>
> Push a task to the queue

###async fetch(): Promise\<Task\>
> Await and fetch a task, this can be called multiple times and resolved seperately, each time `fetch()` is called, a new defered promise will be returned.

###async acknowledge(Task, boolean): Promise\<void\>
> Acknowledges a task, remove it from queue.
> second boolean argument specifies if the record itself should be also deleted.

###start()
> Start pulling for task

###stop()
> Stop pulling for task

###setMaxInterval(number)
> Set the max pulling interval that this queue could increment to (while idling)

###setInitialInterval(number)
> Set the interval to be at after a task if fetched (everytime a task is fetched, interval will be reset to this value, and if not, it will increment)

###setStep(number)
> Set step how much the interval increment each time (while idleing)

###setRetryTimeout(number)
> Each time a task is fetched, it will be put to a __pending__ queue (`acknowledge` removes it). During each time of pulling procedure, task will be fetched from __pending__ first and check if it exceeds the retry timeout. Otherwise, task will be retrieved for __queue__, where new tasks resides in.


##Task
> Task is a Map, with key: string, and value: number | string | boolean.

###id: string
###createdAt: number
###updatedAt: number
###...
