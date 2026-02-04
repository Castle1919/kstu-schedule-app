import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright-chromium';

const app = express();
app.use(cors());
app.use(express.json());

function getWeekRange() {
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - day + 7);
    const formatDate = (d) => d.toISOString().split('T')[0].split('-').reverse().join('.');
    return { monday: formatDate(monday), sunday: formatDate(sunday) };
}

async function scrapeSchedule(username, password) {
    console.log(`\n[!] Начинаю парсинг для: ${username}`);
    const browser = await chromium.launch({
        headless: true, // Возвращаем headless: true
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
        ]
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        javaScriptEnabled: true,
        locale: 'ru-RU',
        timezoneId: 'Asia/Almaty'
    });

    await context.addCookies([{
        name: 'language',
        value: 'ru',
        domain: 'univer.kstu.kz',
        path: '/'
    }]);

    const page = await context.newPage();

    // Скрываем признаки автоматизации (navigator.webdriver и др.)
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
    });

    page.on('console', msg => {
        if (msg.type() === 'error') console.log(`[BROWSER ERR] ${msg.text()}`);
    });

    try {
        await page.goto('https://univer.kstu.kz/user/login', { waitUntil: 'domcontentloaded' });
        await page.fill('input[type="text"]', username);
        await page.fill('input[type="password"]', password);
        await page.click('input[type="submit"]');

        // Ждем перехода после логина или сообщения об ошибке
        await page.waitForTimeout(3000);

        if (page.url().includes('login')) {
            console.log('[!] Ошибка: Не удалось войти в систему. Возможно, неверный пароль.');
            await page.screenshot({ path: 'login_failed.png' });
            throw new Error('Login failed');
        }

        console.log('[!] Принудительная установка RU языка...');
        await page.goto('https://univer.kstu.kz/lang/change/ru/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        const { monday, sunday } = getWeekRange();
        const scheduleUrl = `https://univer.kstu.kz/student/myschedule/2025/2/${monday}/${sunday}/?lang=ru`;
        console.log(`[!] Перехожу по ссылке: ${scheduleUrl}`);

        await page.goto(scheduleUrl, { waitUntil: 'load', timeout: 30000 });

        try {
            await page.waitForSelector('.schedule', { timeout: 15000 });
        } catch (e) {
            console.log('[!] Таймаут: Таблица .schedule не найдена. Делаю скриншот...');
            await page.screenshot({ path: 'schedule_not_found.png', fullPage: true });
            throw e;
        }

        const resultObject = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.schedule tr')).slice(1);
            if (rows.length === 0) return { parsedData: [], debug: "No rows found" };

            const parsedData = rows.map((row) => {
                const allCells = Array.from(row.children);
                if (allCells.length < 2) return null;

                const timeRegex = /\d{1,2}[:.]\d{2}[-–\s]+\d{1,2}[:.]\d{2}/;
                let rowTime = "";
                const firstCell = allCells[0];
                const firstCellText = firstCell.textContent.trim();
                const timeMatch = firstCellText.match(timeRegex);

                if (timeMatch) {
                    rowTime = timeMatch[0].replace(/\s+/g, '').replace(/\./g, ':');
                } else {
                    const rowText = row.textContent.trim();
                    const globalMatch = rowText.match(timeRegex);
                    if (globalMatch) rowTime = globalMatch[0].replace(/\s+/g, '').replace(/\./g, ':');
                }

                if (!rowTime && firstCellText && firstCellText.length > 3) {
                    rowTime = firstCellText.replace(/^\d+\.\s*/, '').substring(0, 11);
                }

                const dayCells = allCells.filter(c =>
                    c.tagName === 'TD' &&
                    (c.querySelector('.groups') || c.classList.contains('field'))
                ).slice(0, 6);

                return dayCells.map(cell => {
                    const divs = cell.querySelectorAll('.groups > div');
                    return Array.from(divs).map(div => {
                        const teachers = div.querySelectorAll('.teacher');
                        const params = div.querySelectorAll('.params span');
                        const fullText = div.innerText.toLowerCase();

                        let type = 'all';
                        if (fullText.includes('чис')) type = 'numerator';
                        if (fullText.includes('знам')) type = 'denominator';

                        const subjectText = teachers[0]?.innerText.trim() || '';
                        const teacherText = teachers[1]?.innerText.trim() || '';

                        const roomText = Array.from(params)
                            .map(p => p.innerText.trim())
                            .join(' ')
                            .replace(/\s+/g, ' ')
                            .replace(/([А-Я]+)(Ауд)/g, '$1 $2');

                        return {
                            time: rowTime,
                            subject: subjectText,
                            teacher: teacherText,
                            room: roomText,
                            type: type
                        };
                    });
                });
            }).filter(r => r !== null);

            const firstValidRow = rows.find(r => r.textContent.match(/\d/));
            const debugInfo = firstValidRow ? firstValidRow.textContent.trim().substring(0, 50) : "No data";

            return { parsedData, debug: debugInfo };
        });

        const finalParsedData = resultObject.parsedData;

        if (finalParsedData.length > 0) {
            const firstRowWithTime = finalParsedData.find(row => row.some(day => day.some(lesson => lesson.time)));
            const lessonWithTime = firstRowWithTime?.find(day => day.length > 0)?.[0];
            if (lessonWithTime) {
                console.log(`[OK] Данные получены. Первая пара: ${lessonWithTime.time}`);
            }
        }

        await browser.close();
        return finalParsedData;

    } catch (err) {
        console.error('!!! ОШИБКА:', err.message);
        if (browser) await browser.close();
        throw err;
    }
}

app.post('/api/schedule', async (req, res) => {
    try {
        const result = await scrapeSchedule(req.body.username, req.body.password);
        res.json(result);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.listen(5000, () => console.log('Backend на 5000'));