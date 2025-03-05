const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { scrapeForUser, formatAssignments } = require('./scraper');
require('dotenv').config();

// Use environment variable for BOT_TOKEN
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN environment variable is not set');
}

console.log('bot token is: ', BOT_TOKEN)
const bot = new Telegraf(BOT_TOKEN);

// Loading credentials from user-details.json
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

// Start command
bot.start((ctx) => {
  ctx.reply('Welcome! Please provide your LMS credentials using /login <username> <password>');
});

// Login command
bot.command('login', (ctx) => {
  const [_, username, password] = ctx.message.text.split(' ');
  if (!username || !password) {
    return ctx.reply('Usage: /login <username> <password>');
  }

  userData.username = username;
  userData.password = password;
  userData.chatId = ctx.chat.id;

  // Save back to user-details.json
  try {
    fs.writeFileSync(credentialsPath, JSON.stringify(userData, null, 2), 'utf-8');
    console.log('Credentials saved to user-details.json');
  } catch (error) {
    console.error('Error saving credentials:', error.message);
  }

  ctx.reply('Credentials saved! I’ll send you assignment updates daily at 8:30 AM, 1:30 PM, and 8:00 PM. Use /assignments to fetch them now.');
});

// /assignments command 
bot.command('assignments', async (ctx) => {
  if (!userData.username || !userData.password || !userData.chatId) {
    return ctx.reply('Please use /login <username> <password> first to set your credentials.');
  }

  if (userData.chatId !== ctx.chat.id) {
    return ctx.reply('Sorry, your chat ID doesn’t match the registered user. Please /login again.');
  }

  await ctx.reply('Fetching your assignments, please wait...');
  try {
    const assignments = await scrapeForUser(userData.username, userData.password);
    const groupedAssignments = formatAssignments(assignments);
    await sendAssignments(ctx.chat.id, groupedAssignments);
  } catch (error) {
    if (error.message.includes('Timeout') || error.message.includes('net::ERR_CONNECTION')) {
      await ctx.reply('Network is slow, try manually:\nLMS link: https://lms.klh.edu.in/login/index.php');
    } else {
      await ctx.reply('Error fetching assignments. Please try again later.');
    }
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

  function escapeMarkdown(text) {
    return text.replace(/([_*[\]()~`>#+=|-])/g, '\\$1').replace(/&/g, '\\&');
  }

  if (Object.keys(assignments).length === 0) {
    await bot.telegram.sendMessage(chatId, 'Congrats🎊🎊🎉 , you don\'t have any assignments left, let\'s gooooo!!!!!', { parse_mode: 'Markdown' });
    return;
  }

  const messageLines = [];
  for (const [dueDate, assignmentsList] of Object.entries(assignments)) {
    messageLines.push(`*↣ Assignments due on ${escapeMarkdown(dueDate.replace(/, 2025$/, ''))}:*`);
    assignmentsList.forEach((assignment, index) => {
      const assignmentBlock = [];
      let assignmentName = escapeMarkdown(assignment.name);

      if (dueDate === todayDate) {
        assignmentBlock.push('⚠️');
        assignmentBlock.push(`*${`Course ${index + 1}: ${assignment.course}`}*`);
        assignmentBlock.push(`*${`Assignment${index + 1}: ${assignmentName}`}*`);
        assignmentBlock.push(`*${`Link ${index + 1}: ${assignment.href}`}*`);
        assignmentBlock.push('⚠️');
      } else {
        assignmentBlock.push(`Course ${index + 1}: ${assignment.course}`);
        assignmentBlock.push(`Assignment${index + 1}: ${assignmentName}`);
        assignmentBlock.push(`Link ${index + 1}: ${assignment.href}`);
      }

      const tabbedBlock = assignmentBlock.map(line => `        ${line}`);
      messageLines.push(...tabbedBlock, '');
    });
    messageLines.push("--------------------------------------------------------------------------------");
  }

  const message = messageLines.join('\n');
  await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
}

module.exports = { bot, sendAssignments, getUserData: () => userData };
