/**
 * Agent loop that works with AgentMessage throughout.
 * Transforms to Message[] only at the LLM call boundary.
 */

import {
	type AssistantMessage,
	Context,
	EventStream,
	streamSimple,
	type ToolResultMessage,
	validateToolArguments,
} from "@earendil-works/pi-ai";
import type {
	AgentContext,
	AgentEvent,
	AgentLoopConfig,
	AgentMessage,
	AgentTool,
	AgentToolCall,
	AgentToolResult,
	StreamFn,
} from "./types.ts";

export type AgentEventSink = (event: AgentEvent) => Promise<void> | void;

/**
 * Start an agent loop with a new prompt message.
 * The prompt is added to the context and events are emitted for it.
 */
export function agentLoop(
    prompts: AgentMessage[],
    context: AgentContext,
    config: AgentLoopConfig,
    signal?: AbortSignal,
    streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
    const stream = createAgentStream();

    void runAgentLoop(
        prompts,
        context,
        config,
        async (event) => {
            stream.push(event);
        },
        signal,
        streamFn,
    ).then((messages) => {
        stream.end(messages);
    });

    return stream;
}

/**
 * Continue an agent loop from the current context without adding a new message.
 * Used for retries - context already has user message or tool results.
 *
 * **Important:** The last message in context must convert to a `user` or `toolResult` message
 * via `convertToLlm`. If it doesn't, the LLM provider will reject the request.
 * This cannot be validated here since `convertToLlm` is only called once per turn.
 */
export function agentLoopContinue(
    context: AgentContext,
    config: AgentLoopConfig,
    signal?: AbortSignal,
    streamFn?: StreamFn,
): EventStream<AgentEvent, AgentMessage[]> {
    if (context.messages.length === 0) {
        throw new Error("Cannot continue: no messages in context");
    }

    if (context.messages[context.messages.length - 1].role === "assistant") {
        throw new Error("Cannot continue from message role: assistant");
    }

    const stream = createAgentStream();

    void runAgentLoopContinue(
        context,
        config,
        async (event) => {
            stream.push(event);
        },
        signal,
        streamFn,
    ).then((messages) => {
        stream.end(messages);
    });

    return stream;
}

export async function runAgentLoop(
    prompts: AgentMessage[],
    context: AgentContext,
    config: AgentLoopConfig,
    emit: AgentEventSink,
    signal?: AbortSignal,
    streamFn?: StreamFn,
): Promise<AgentMessage[]> {
    const newMessages: AgentMessage[] = [...prompts];
    const currentContext: AgentContext = {
        ...context,
        messages: [...context.messages, ...prompts],
    };

    await emit({ type: "agent_start"});
    await emit({ type: "turn_start"});
    for (const prompt of prompts) {
        await emit({ type: "message_start", message: prompt });
        await emit({ type: "message_end", message: prompt });
    }

    await runLoop(currentContext, newMessages, config, signal, emit, streamFn);
    return newMessages;
}

export async function runAgentLoopContinue(
    context: AgentContext,
    config: AgentLoopConfig,
    emit: AgentEventSink,
    signal?: AbortSignal,
    streamFn?: StreamFn,
): Promise<AgentMessage[]> {
    if (context.messages.length === 0) {
        throw new Error("Cannot continue: no messages in context");
    }

    if (context.messages[context.messages.length].role === "assistant") {
        throw new Error("Cannot continue from message role: assistant");
    }

    const newMessages: AgentMessage[] = [];
    const currentContext: AgentContext = { ...context };

    await emit({ type: "agent_start" });
    await emit({ type: "turn_start" });

    await runLoop(currentContext, newMessages, config, signal, emit, streamFn);
    return newMessages;
}

function createAgentStream(): EventStream<AgentEvent, AgentMessage[]> {
    return new EventStream<AgentEvent, AgentMessage[]>(
        (event: AgentEvent) => event.type === "agent_end",
        (event: AgentEvent) => (event.type === "agent_end" ? event.messages : []),
    );
}

/**
 * Main loop logic shared by agentLoop and agentLoopContinue.
 */
async function runLoop(
    initialContext: AgentContext,
    newMessages: AgentMessage[],
    initialConfig: AgentLoopConfig,
    signal: AbortSignal | undefined,
    emit: AgentEventSink,
    streamFn?: StreamFn,
): Promise<void> {
    let currentContext = initialContext;
    let config = initialConfig;
    let firstTurn = true;
    // Check for steering messages at start (user may have typed while waiting)
    let pendingMessages: AgentMessage[] = (await config.getSteeringMessages?.()) || [];
 
    // Outer loop: continues when queued follow-up messages arrive after agent would stop
    while(true) {
        let hasMoreToolCalls = true;

        // Inner loop: process tool calls and steering messages(引导消息)
        while (hasMoreToolCalls || pendingMessages.length > 0) {
            if (!firstTurn) {
                await emit({ type: "turn_start" });
            } else {
                firstTurn = false;
            }

            // Process pending messages (inject before next assistant response)
            if (pendingMessages.length > 0) {
                for (const message of pendingMessages) {
                    await emit({ type: "message_start", message });
                    await emit({ type: "message_end", message});
                    currentContext.messages.push(message);
                    newMessages.push(message);
                }
                pendingMessages = [];
            }

            // Stream assistant response
            const message = await streamAssistantResponse(currentContext, config, signal, emit, streamFn);
            newMessages.push(message);

            if (message.stopReason === "error" || message.stopReason === "aborted") {
                await emit({ type: "turn_end", message, toolResults:[] });
                await emit({ type: "agent_end", messages: newMessages });
                return;
            }

            // Check for tool calls
            const toolCalls = message.content.filter((c) => c.type === "toolCall");

            const toolResults: ToolResultMessage[] = [];
            hasMoreToolCalls = false;
            if (toolCalls.length > 0) {
                const executedToolBactch = await executedToolCalls(currentContext, message, config, signal, emit);
                toolResults.push(...executedToolBactch.message);
                hasMoreToolCalls = !executedToolBactch.terminate;

                for (const result of toolResults) {
                    currentContext.messages.push(result);
                    newMessages.push(result);
                }
            }

            await emit({ type: "turn_end", message, toolResults});

            const nextTurnContext = {
                message,
                toolResults,
                context: currentContext,
                newMessages,
            };
            const nextTurnSnapshot = await config.prepareNextTurn?.(nextTurnContext);
            if (nextTurnSnapshot) {
                currentContext = nextTurnSnapshot.context ?? currentContext;
                config = {
                    ...config,
                    model: nextTurnSnapshot.model ?? config.model,
                    reasoning:
                        nextTurnSnapshot.thinkingLevel == undefined
                            ? config.reasoning
                            : nextTurnSnapshot.thinkingLevel === "off"
                                ? undefined
                                : nextTurnSnapshot.thinkingLevel,
                }
            }

            if (
                await config.shouldStopAfterTurn?.({
                    message,
                    toolResults,
                    context: currentContext,
                    newMessages,
                })
            ) {
                await emit({ type: "agent_end", messages: newMessages});
                return;
            }

            pendingMessages = (await config.getSteeringMessages?.()) || [];
        }

        // Agent would stop here. Check for follow-up messages.
        const followUpMessages = (await config.getFollowUpMessages?.()) || []
        if (followUpMessages.length > 0) {
            // Set as pending so inner loop processes them
            pendingMessages = followUpMessages;
            continue;
        }

        // No more messages, exit
        break;
    }

    await emit({ type: "agent_end", messages: newMessages });
}

/**
 * Stream an assistant response from the LLM.
 * This is where AgentMessage[] gets transformed to Message[] for the LLM.
 */
async function streamAssistantResponse(
	context: AgentContext,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	emit: AgentEventSink,
	streamFn?: StreamFn,
): Promise<AssistantMessage> {
	// Apply context transform if configured (AgentMessage[] → AgentMessage[])
	let messages = context.messages;
	if (config.transformContext) {
		messages = await config.transformContext(messages, signal);
	}

	// Convert to LLM-compatible messages (AgentMessage[] → Message[])
	const llmMessages = await config.convertToLlm(messages);

	// Build LLM context
	const llmContext: Context = {
		systemPrompt: context.systemPrompt,
		messages: llmMessages,
		tools: context.tools,
	};

	const streamFunction = streamFn || streamSimple;

	// Resolve API key (important for expiring tokens)
	const resolvedApiKey =
		(config.getApiKey ? await config.getApiKey(config.model.provider) : undefined) || config.apiKey;

	const response = await streamFunction(config.model, llmContext, {
		...config,
		apiKey: resolvedApiKey,
		signal,
	});

	let partialMessage: AssistantMessage | null = null;
	let addedPartial = false;

	for await (const event of response) {
		switch (event.type) {
			case "start":
				partialMessage = event.partial;
				context.messages.push(partialMessage);
				addedPartial = true;
				await emit({ type: "message_start", message: { ...partialMessage } });
				break;

			case "text_start":
			case "text_delta":
			case "text_end":
			case "thinking_start":
			case "thinking_delta":
			case "thinking_end":
			case "toolcall_start":
			case "toolcall_delta":
			case "toolcall_end":
				if (partialMessage) {
					partialMessage = event.partial;
					context.messages[context.messages.length - 1] = partialMessage;
					await emit({
						type: "message_update",
						assistantMessageEvent: event,
						message: { ...partialMessage },
					});
				}
				break;

			case "done":
			case "error": {
				const finalMessage = await response.result();
				if (addedPartial) {
					context.messages[context.messages.length - 1] = finalMessage;
				} else {
					context.messages.push(finalMessage);
				}
				if (!addedPartial) {
					await emit({ type: "message_start", message: { ...finalMessage } });
				}
				await emit({ type: "message_end", message: finalMessage });
				return finalMessage;
			}
		}
	}

	const finalMessage = await response.result();
	if (addedPartial) {
		context.messages[context.messages.length - 1] = finalMessage;
	} else {
		context.messages.push(finalMessage);
		await emit({ type: "message_start", message: { ...finalMessage } });
	}
	await emit({ type: "message_end", message: finalMessage });
	return finalMessage;
}
