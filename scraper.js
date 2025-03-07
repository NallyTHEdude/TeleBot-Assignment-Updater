const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function setupBrowser() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const outputDir = path.join(__dirname, 'errors');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  return { browser, page, outputDir };
}

async function loginToDashboard(page, username, password) {
  const URL_LOGIN = 'https://lms.klh.edu.in/login/index.php';
  const URL_DASHBOARD = 'https://lms.klh.edu.in/my/';

  await page.goto(URL_LOGIN, { waitUntil: 'networkidle2' });
  await page.type('input[name="username"]', username);
  await page.type('input[name="password"]', password);
  await page.click('#loginbtn');

  // Wait for navigation or timeout
  await page.waitForNavigation({ timeout: 5000 }).catch(async () => {
    // Check if still on login page or error message appears
    const currentUrl = page.url();
    const errorMessage = await page.$eval('#loginerrormessage', el => el.textContent.trim()).catch(() => null);

    if (currentUrl === URL_LOGIN || errorMessage) {
      throw new Error('InvalidCredentials: Incorrect username or password');
    }
  });

  // Verify dashboard is reached
  if (page.url() !== URL_DASHBOARD) {
    throw new Error('InvalidCredentials: Incorrect username or password');
  }
}

async function scrapeAssignments(page) {
  await page.waitForSelector('.timeline-event-list-item', { timeout: 60000 });

  return await page.evaluate(() => {
    const wrapper = document.querySelector('div[data-region="event-list-wrapper"]');
    if (!wrapper) return [];

    const hasAssignments = wrapper.querySelector('.event-name') !== null;
    if (!hasAssignments) return []; // Empty array signals no assignments

    const assignmentsList = [];
    let currentDueDate = 'Unknown';

    const children = Array.from(wrapper.children);
    for (const child of children) {
      if (child.matches('div[data-region="event-list-content-date"]')) {
        if (child.querySelector('h5')) {
          let [, day, month, year] = child.querySelector('h5').textContent.trim().split(" ");
          let adjustedDay = parseInt(day);
          if (adjustedDay < 10) {
            day = `0${adjustedDay}`;
          } else {
            day = `${adjustedDay}`;
          }
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

async function scrapeForUser(username, password, retries = 3) {
  const { browser, page, outputDir } = await setupBrowser();
  for (let i = 0; i < retries; i++) {
    try {
      await loginToDashboard(page, username, password);
      const assignments = await scrapeAssignments(page);
      await browser.close();
      return assignments;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed: ${error.message}`);
      if (error.message.includes('InvalidCredentials')) {
        await browser.close();
        throw error; // Don’t retry on credential error
      }
      if (i === retries - 1) {
        await browser.close();
        throw error; // Last attempt failed
      }
      await page.goto('https://lms.klh.edu.in/login/index.php', { waitUntil: 'networkidle2' }); // Retry
    }
  }
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

module.exports = { scrapeForUser, formatAssignments };