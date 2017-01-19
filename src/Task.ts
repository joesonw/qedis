
abstract class Task {
    abstract id: string;
    abstract createdAt: number;
    abstract updatedAt: number;
    abstract fields: {[key: string] : string };
}

export default Task;
