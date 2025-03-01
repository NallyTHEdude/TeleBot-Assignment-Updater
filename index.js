const cron = require('node-cron');
const { bot, sendAssignments, getUserData } = require('./bot');
const { scrapeForUser, formatAssignments } = require('./scraper');

const times = ['30 8 * * *', '30 13 * * *', '0 20 * * *']; // 8:30 AM, 1:30 PM, 8:00 PM IST

times.forEach(time => {
  cron.schedule(time, async () => {
    console.log(`Running assignment check at ${new Date().toLocaleString()}`);
    const user = getUserData();

    if (user.chatId && user.username && user.password) {
      const assignments = await scrapeForUser(user.username, user.password);
      const groupedAssignments = formatAssignments(assignments);
      await sendAssignments(user.chatId, groupedAssignments);
    } else {
      console.log('No user credentials or chatId available yet.');
    }
  }, {
    timezone: 'Asia/Kolkata'
  });
});

bot.launch();
console.log('Bot is running...');