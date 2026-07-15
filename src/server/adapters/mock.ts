import {AdapterEvent, AdapterRequest, LLMAdapter} from "@/server/adapters/types";


export class MockAdapter implements LLMAdapter{
    async *run(request: AdapterRequest, signal: AbortSignal): AsyncGenerator<AdapterEvent>{
        const reply = '你好,我是Mock Agent,正在模拟流式输出'

        yield { type: "text.start"}

        for (const char of reply){
            if(signal.aborted) return

            yield { type: "text.delta", text : char}

            await new Promise(resolve => setTimeout(resolve,50))

        }

        yield { type: "text.end"}
        yield { type: "done"}
    }
}