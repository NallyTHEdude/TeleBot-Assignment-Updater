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

  // Build message as an array of lines for clarity
  const messageLines = [];

  for (const [dueDate, assignmentsList] of Object.entries(assignments)) {
    // Bold the due date line without tab spacing
    messageLines.push(`*↣ Assignments due on ${dueDate.replace(/, 2025$/, '')}:*`);

    assignmentsList.forEach((assignment, index) => {
      // Build assignment block as an array of lines
      const assignmentBlock = [];
      let assignmentName = assignment.name;

      if (dueDate === todayDate) {
        assignmentBlock.push('⚠️'); // Before assignment
        assignmentBlock.push(`*${`Course ${index + 1}: ${assignment.course}`}*`);
        assignmentBlock.push(`*${`Assignment${index + 1}: ${assignmentName}`}*`);
        assignmentBlock.push(`*${`Link ${index + 1}: ${assignment.href}`}*`);
        assignmentBlock.push('⚠️'); // After assignment
      }else{
        assignmentBlock.push(`Course ${index + 1}: ${assignment.course}`);
        assignmentBlock.push(`Assignment${index + 1}: ${assignmentName}`);
        assignmentBlock.push(`Link ${index + 1}: ${assignment.href}`);
      }

      // Add tab spacing to each line of the assignment block
      const tabbedBlock = assignmentBlock.map(line => `        ${line}`);
      messageLines.push(...tabbedBlock, ''); // Add block and a blank line
    });
    messageLines.push("--------------------------------------------------------------------------------");
  }

  // Join lines into final message
  const message = messageLines.join('\n');
  message
  await bot.telegram.sendMessage(chatId, message || 'No assignments found', { parse_mode: 'Markdown' });
}

module.exports = { bot, sendAssignments, getUserData: () => userData };