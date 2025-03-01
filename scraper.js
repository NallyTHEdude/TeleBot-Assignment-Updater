const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Global browser instance
let globalBrowser = null;

async function initializeBrowser() {
  if (!globalBrowser) {
    globalBrowser = await puppeteer.launch({ headless: true });
    console.log('Browser initialized');
  }
  return globalBrowser;
}

async function setupPage(browser) {
  const page = await browser.newPage();
  const outputDir = path.join(__dirname, 'page');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  return { page, outputDir };
}

async function loginToDashboard(page, username, password) {
  const URL_LOGIN = 'https://lms.klh.edu.in/login/index.php';
  const URL_DASHBOARD = 'https://lms.klh.edu.in/my/';

  await page.goto(URL_LOGIN, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.type('input[name="username"]', username);
  await page.type('input[name="password"]', password);
  await page.click('#loginbtn');
  await page.waitForFunction(`window.location.href === "${URL_DASHBOARD}"`, { timeout: 30000 });
}

async function scrapeAssignments(page) {
  await page.waitForSelector('.timeline-event-list-item', { timeout: 30000 });

  return await page.evaluate(() => {
    const wrapper = document.querySelector('div[data-region="event-list-wrapper"]');
    if (!wrapper) return [];

    const assignmentsList = [];
    let currentDueDate = 'Unknown';

    const children = Array.from(wrapper.children);
    for (const child of children) {
      if (child.matches('div[data-region="event-list-content-date"]')) {
        if (child.querySelector('h5')) {
          let [, day, month, year] = child.querySelector('h5').textContent.trim().split(" ");
          let adjustedDay = parseInt(day) ; 
          day = adjustedDay < 10 ? `0${adjustedDay}` : `${adjustedDay}`;
          currentDueDate = `${year}|${month}|${day}`;
        } else {
          currentDueDate = 'Unknown';
        }
      } else if (child.classList.contains('list-group')) {
        const items = child.querySelectorAll('.timeline-event-list-item');
        items.forEach(item => {
          const name = item.querySelector('.event-name a')?.textContent.trim() || 'Unknown';
          const href = item.querySelector('.event-name a')?.getAttribute('href') || 'No link exists';
          let fullCourse = item.querySelector('.event-name-container > small')?.textContent.trim() || 'Unknown';
          fullCourse = fullCourse.replace('Assignment is due · ', '');
          const courseWords = fullCourse.split(' ');
          const course = courseWords.slice(0, -3).join(' ') || 'Unknown';
          assignmentsList.push({ name, course, dueDate: currentDueDate, href });
        });
      }
    }

    return assignmentsList;
  });
}

async function scrapeForUser(username, password) {
  const browser = await initializeBrowser();
  const { page, outputDir } = await setupPage(browser);
  try {
    await loginToDashboard(page, username, password);
    const assignments = await scrapeAssignments(page);
    return assignments;
  } catch (error) {
    console.error(`Scraping error for ${username}:`, error);
    if (page) {
      fs.writeFileSync(path.join(outputDir, `error-${username}.html`), await page.content(), 'utf-8');
    }
    return [];
  } finally {
    await page.close(); // Close page, not browser
  }
}

// Batch scraping for multiple users
async function scrapeForUsers(users, maxConcurrency = 5) {
  const browser = await initializeBrowser();
  const results = [];

  // Process users in batches
  async function processBatch(batch) {
    const promises = batch.map(async ({ username, password }) => {
      const { page } = await setupPage(browser);
      try {
        await loginToDashboard(page, username, password);
        const assignments = await scrapeAssignments(page);
        return { username, assignments };
      } catch (error) {
        console.error(`Scraping error for ${username}:`, error);
        return { username, assignments: [] };
      } finally {
        await page.close();
      }
    });
    return Promise.all(promises);
  }

  // Split users into batches
  for (let i = 0; i < users.length; i += maxConcurrency) {
    const batch = users.slice(i, i + maxConcurrency);
    const batchResults = await processBatch(batch);
    results.push(...batchResults);
  }

  return results.reduce((acc, { username, assignments }) => {
    acc[username] = formatAssignments(assignments);
    return acc;
  }, {});
}

function formatAssignments(assignments) {
  const assignmentsByDate = {};
  assignments.forEach(assignment => {
    const date = assignment.dueDate;
    if (!assignmentsByDate[date]) {
      assignmentsByDate[date] = [];
    }
    assignmentsByDate[date].push(assignment);
  });
  return assignmentsByDate;
}

// Cleanup function (call when shutting down)
async function cleanupBrowser() {
  if (globalBrowser) {
    await globalBrowser.close();
    globalBrowser = null;
    console.log('Browser closed');
  }
}

module.exports = { scrapeForUser, scrapeForUsers, formatAssignments, cleanupBrowser };