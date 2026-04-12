let appPromise;

module.exports = async (req, res) => {
  if (!appPromise) {
    appPromise = import('./server.mjs').then((m) => m.default);
  }
  const app = await appPromise;
  return app(req, res);
};
