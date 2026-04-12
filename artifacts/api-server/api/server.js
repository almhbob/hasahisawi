let app;

export default async (req, res) => {
  if (!app) {
    const mod = await import('./server.mjs');
    app = mod.default;
  }
  return app(req, res);
};
