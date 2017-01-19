
abstract class Task {
    abstract id: string;
    abstract createdAt: Date;
    abstract updatedAt: Date;
    abstract fields: {[key: string] : string };
}

export default Task;
