const express = require('express');
const cron = require('node-cron');
const { bot, sendAssignments, getUserData } = require('./bot');
const { scrapeForUser, formatAssignments } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies (required for Telegram webhook)
app.use(express.json());

// Set up webhook route for Telegram
const WEBHOOK_PATH = `/bot${process.env.BOT_TOKEN}`;
app.post(WEBHOOK_PATH, (req, res) => {
  bot.handleUpdate(req.body, res);
});

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Telegram bot is running...');
});

// Start the Express server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  const WEBHOOK_URL = `${process.env.RENDER_EXTERNAL_URL}${WEBHOOK_PATH}`;
  try {
    await bot.telegram.setWebhook(WEBHOOK_URL);
    console.log(`Webhook set to: ${WEBHOOK_URL}`);
  } catch (err) {
    console.error('Webhook setup error:', err);
  }
});

// Schedule updates at 8:30 AM, 1:30 PM, and 8:00 PM IST
const times = ['30 8 * * *', '30 13 * * *', '0 20 * * *'];
times.forEach(time => {
  cron.schedule(time, async () => {
    console.log(`Running assignment check at ${new Date().toLocaleString()}`);
    const user = getUserData();
    if (user.chatId && user.username && user.password) {
      try {
        const assignments = await scrapeForUser(user.username, user.password);
        const groupedAssignments = formatAssignments(assignments);
        await sendAssignments(user.chatId, groupedAssignments);
      } catch (error) {
        console.error('Scheduled scrape error:', error);
      }
    } else {
      console.log('No user data available for scheduling');
    }
  }, { timezone: 'Asia/Kolkata' });
});
