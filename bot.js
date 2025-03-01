const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { scrapeForUser, formatAssignments } = require('./scraper');
const { BOT_TOKEN }= require('./api-key');

const bot = new Telegraf(BOT_TOKEN);

// Load initial credentials from user-details.json
const credentialsPath = path.join(__dirname, 'user-details.json');
let userData;

try {
  const credentialsData = fs.readFileSync(credentialsPath, 'utf-8');
  userData = JSON.parse(credentialsData);
  console.log('Loaded initial credentials from user-details.json');
} catch (error) {
  console.error('Error reading user-details.json:', error.message);
  userData = { username: '', password: '', chatId: null };
}

bot.start((ctx) => {
  ctx.reply('Welcome! Please provide your LMS credentials using /login <username> <password>');
});

bot.command('login', (ctx) => {
  const [_, username, password] = ctx.message.text.split(' ');
  if (!username || !password) {
    return ctx.reply('Usage: /login <username> <password>');
  }

  userData.username = username;
  userData.password = password;
  userData.chatId = ctx.chat.id;

  // Optionally save back to user-details.json (uncomment if desired)
  fs.writeFileSync(credentialsPath, JSON.stringify(userData, null, 2), 'utf-8');

  ctx.reply('Credentials saved! I’ll send you assignment updates daily at 8:30 AM, 1:30 PM, and 8:00 PM. Use /assignments to fetch them now.');
});

// New /assignments command
bot.command('assignments', async (ctx) => {
  if (!userData.username || !userData.password || !userData.chatId) {
    return ctx.reply('Please use /login <username> <password> first to set your credentials.');
  }

  if (userData.chatId !== ctx.chat.id) {
    return ctx.reply('Sorry, your chat ID doesn’t match the registered user. Please /login again.');
  }

  ctx.reply('Fetching your assignments, please wait...');
  try {
    const assignments = await scrapeForUser(userData.username, userData.password);
    const groupedAssignments = formatAssignments(assignments);
    await sendAssignments(ctx.chat.id, groupedAssignments);
  } catch (error) {
    ctx.reply('Error fetching assignments. Please try again later.');
    console.error('Error in /assignments:', error);
  }
});

async function sendAssignments(chatId, assignments) {
  const today = new Date();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const day = String(today.getDate()).padStart(2, '0');
  const month = monthNames[today.getMonth()];
  const year = today.getFullYear();
  const todayDate = `${year}|${month}|${day}`;

  let message = '';
  for (const [dueDate, assignmentsList] of Object.entries(assignments)) {
    message += `\nAssignments due on ${dueDate.replace(/, 2025$/, '')}:\n`;
    assignmentsList.forEach((assignment, index) => {
      let assignmentBlock = '';
      let assignmentName = assignment.name;
      if (dueDate === todayDate) {
        assignmentName = `*${assignmentName.toUpperCase()}*`; // Bold for today
        assignmentBlock += '⚠️⚠️TODAY⚠️⚠️\n'; // Before assignment
      }
      assignmentBlock += `Course ${index + 1}: ${assignment.course}\n`;
      assignmentBlock += `Assignment${index + 1}: ${assignmentName}\n`;
      assignmentBlock += `Link ${index + 1}: ${assignment.href}\n`;
      if (dueDate === todayDate) {
        // assignmentBlock = `*${assignmentBlock}*`;
        assignmentBlock += '⚠️⚠️TODAY⚠️⚠️\n'; // After assignment
      }
      message += assignmentBlock + '\n';
    });
  }
  await bot.telegram.sendMessage(chatId, message || 'No assignments found', { parse_mode: 'Markdown' });
}

module.exports = { bot, sendAssignments, getUserData: () => userData };