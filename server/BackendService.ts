import { GenezioDeploy } from "@genezio/types";

type InputArgs = {
    x: number;
    y: number;
};

@GenezioDeploy()
export class BackendService {
    constructor() {
    }

    async sum(args: InputArgs) {
        return args.x + args.y;
    }

    async delayedSum(args: InputArgs): Promise<number> {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve(args.x + args.y);
            }, 10000);
        });
    }

    async prod(args: InputArgs) {
        return args.x * args.y;
    }
}