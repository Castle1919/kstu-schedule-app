import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright-core';
import sparticuzChromium from '@sparticuz/chromium';

const app = express();
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:5173', // если используешь Vite
        'https://твой-фронтенд.vercel.app' // замени на адрес своего фронта
    ],
    credentials: true
}));
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

    let browser;
    try {
        // --- ЛОГИКА ЗАПУСКА БРАУЗЕРА (ДЛЯ ОБЛАКА И LOCAL) ---
        const launchArgs = [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--disable-accelerated-2d-canvas',
            '--ignore-certificate-errors',
            '--blink-settings=imagesEnabled=false', // Отключаем изображения для экономии памяти
        ];

        if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
            browser = await chromium.launch({
                args: [...sparticuzChromium.args, ...launchArgs],
                executablePath: await sparticuzChromium.executablePath(),
                headless: true,
            });
        } else {
            console.log('[!] Запуск локального Chromium...');
            browser = await chromium.launch({
                headless: true,
                args: launchArgs
            });
        }

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 },
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

        // Скрываем автоматизацию
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
        });

        // 1. Логин
        await page.goto('https://univer.kstu.kz/user/login', { waitUntil: 'domcontentloaded' });
        await page.fill('input[type="text"]', username);
        await page.fill('input[type="password"]', password);

        await Promise.all([
            page.click('input[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => { })
        ]);

        if (page.url().includes('login')) {
            console.log('[!] Ошибка: Неверный логин или пароль.');
            throw new Error('Invalid login or password');
        }

        // 2. Смена языка
        console.log('[!] Установка RU языка...');
        await page.goto('https://univer.kstu.kz/lang/change/ru/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        // 3. Переход к расписанию
        const { monday, sunday } = getWeekRange();
        const scheduleUrl = `https://univer.kstu.kz/student/myschedule/2025/2/${monday}/${sunday}/?lang=ru`;
        console.log(`[!] Перехожу: ${scheduleUrl}`);

        await page.goto(scheduleUrl, { waitUntil: 'networkidle', timeout: 30000 });

        try {
            await page.waitForSelector('.schedule', { timeout: 15000 });
        } catch (e) {
            console.log('[!] Таймаут: .schedule не найдена.');
            throw new Error('Schedule table not found on page');
        }

        // 4. Парсинг
        const resultObject = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.schedule tr')).slice(1);
            if (rows.length === 0) return { parsedData: [] };

            const cleanText = (text) => {
                if (!text) return "";
                return text.replace(/Период с \d{2}\.\d{2} по \d{2}\.\d{2} (знаменатель|числитель)/gi, '').trim();
            };

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
                    c.tagName === 'TD' && (c.querySelector('.groups') || c.classList.contains('field'))
                ).slice(0, 6);

                return dayCells.map(cell => {
                    const divs = cell.querySelectorAll('.groups > div');
                    return Array.from(divs).map(div => {
                        const teachers = div.querySelectorAll('.teacher');
                        const params = div.querySelectorAll('.params span');
                        const fullText = div.innerText.toLowerCase();
                        let type = fullText.includes('чис') ? 'numerator' : (fullText.includes('знам') ? 'denominator' : 'all');

                        return {
                            time: rowTime,
                            subject: cleanText(teachers[0]?.innerText || ''),
                            teacher: cleanText(teachers[1]?.innerText || ''),
                            room: cleanText(Array.from(params).map(p => p.innerText.trim()).join(' ').replace(/\s+/g, ' ')),
                            type
                        };
                    });
                });
            }).filter(r => r !== null);

            return { parsedData };
        });

        return resultObject.parsedData;

    } catch (err) {
        console.error('!!! ОШИБКА ПАРСИНГА:', err.message);
        throw err;
    } finally {
        if (browser) {
            console.log('[!] Закрытие браузера...');
            await browser.close();
        }
    }
}

app.post('/api/schedule', async (req, res) => {
    try {
        const result = await scrapeSchedule(req.body.username, req.body.password);
        res.json(result);
    } catch (error) {
        if (error.message === 'Invalid login or password') {
            res.status(401).json({ error: error.message });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

app.listen(5000, () => console.log('Backend на 5000'));