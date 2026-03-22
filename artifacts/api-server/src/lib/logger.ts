const isProduction = process.env.NODE_ENV === "production";

function formatMsg(level: string, msg: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (args.length) return `${prefix} ${msg} ${args.map(a => JSON.stringify(a)).join(" ")}`;
  return `${prefix} ${msg}`;
}

export const logger = {
  info:  (msg: string, ...a: unknown[]) => console.log(formatMsg("info", msg, ...a)),
  warn:  (msg: string, ...a: unknown[]) => console.warn(formatMsg("warn", msg, ...a)),
  error: (msg: string, ...a: unknown[]) => console.error(formatMsg("error", msg, ...a)),
  debug: (msg: string, ...a: unknown[]) => { if (!isProduction) console.debug(formatMsg("debug", msg, ...a)); },
  fatal: (msg: string, ...a: unknown[]) => console.error(formatMsg("fatal", msg, ...a)),
  child: (_bindings: Record<string, unknown>) => logger,
};
