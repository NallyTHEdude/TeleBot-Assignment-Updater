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
  await page.waitForFunction(`window.location.href === "${URL_DASHBOARD}"`, { timeout: 60000 });
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
          let adjustedDay = parseInt(day) ;
          if(adjustedDay < 10){
            day = `0${adjustedDay}`;
          }else{
            day=`${adjustedDay}`;
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
  try {
    await loginToDashboard(page, username, password);
    const assignments = await scrapeAssignments(page);
    return assignments;
  } catch (error) {
    console.error(`Attempt ${i+1} failed: ${error}`);
    if (i === retries-1) throw error; // Last attempt
  } finally {
    await browser.close();
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
