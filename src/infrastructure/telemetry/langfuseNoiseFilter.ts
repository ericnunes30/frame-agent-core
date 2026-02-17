const MULTIMODAL_NULL_AUDIO_ERROR =
  "[Langfuse SDK] Error processing multimodal event: TypeError: Cannot use 'in' operator to search for 'data' in null";

let installed = false;
let originalConsoleError: typeof console.error | undefined;

function stringify(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function installLangfuseNoiseFilter(enabled: boolean): void {
  if (!enabled || installed) return;

  originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const message = args.map(stringify).join(' ');
    if (message.includes(MULTIMODAL_NULL_AUDIO_ERROR)) return;
    originalConsoleError?.(...(args as Parameters<typeof console.error>));
  };

  installed = true;
}
