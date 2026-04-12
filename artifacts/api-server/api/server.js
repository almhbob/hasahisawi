export default (req, res) => {
  res.status(200).json({ ok: true, service: 'hasahisawi-api', time: new Date().toISOString() });
};
