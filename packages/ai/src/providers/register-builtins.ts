import { registerApiProvider } from "../api-registry.js";
import { openAIApiProvider } from "./openai.js";

// 模块加载时自动注册内置 provider，调用方只需要 import stream/complete。
registerApiProvider(openAIApiProvider);
