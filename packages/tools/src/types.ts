export interface ToolExecutionResult<TDetails = unknown> {
  content: string;
  details?: TDetails;
}

export interface BuiltinTool<TInput, TDetails = unknown> {
  name: string;
  description: string;
  execute: (input: TInput, signal?: AbortSignal) => Promise<ToolExecutionResult<TDetails>>;
}
