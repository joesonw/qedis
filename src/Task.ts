
type Primitive = number | string | boolean ;

interface Task {
    [key: string] : Primitive;
    id: string;
    createdAt?: number;
    updatedAt?: number;
    intermediate?: boolean;
}

export {Primitive};
export default Task;
