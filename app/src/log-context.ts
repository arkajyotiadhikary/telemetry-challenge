// Level 1: a box that follows one async call chain.
//
// Sunvoy keeps requestId, app, provider, project in an AsyncLocalStorage store so
// code ten calls deep can log them without having them passed in.
//
// Implement:
//   runWithLogContext(store, fn)  -> run fn with store merged over the current one
//   getLogContext()               -> the current store, or undefined
//
// Hint: node:async_hooks AsyncLocalStorage. Merge, never replace, so nested calls add fields.

export type LogContextStore = {
    requestId?: string;
    app?: string;
    provider?: string;
    project?: string;
};

export function runWithLogContext<T>(store: LogContextStore, fn: () => T): T {
    // TODO(level 1)
    return fn();
}

export function getLogContext(): LogContextStore | undefined {
    // TODO(level 1)
    return undefined;
}
