declare type Primitive = number | string | boolean;
interface Task {
    [key: string]: Primitive;
    id: string;
    createdAt?: number;
    updatedAt?: number;
}
export { Primitive };
export default Task;
