const { app, connectToDatabase } = require('../server');

module.exports = async (req, res) => {
  try {
    await connectToDatabase();
    return app(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).send('Internal Server Error');
  }
};
