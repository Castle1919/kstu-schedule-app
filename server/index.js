import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright-core';
import sparticuzChromium from '@sparticuz/chromium';

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

    let browser;

    // --- ЛОГИКА ЗАПУСКА БРАУЗЕРА (ДЛЯ ОБЛАКА И LOCAL) ---
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        // Настройки для Vercel / Render
        browser = await chromium.launch({
            args: sparticuzChromium.args,
            executablePath: await sparticuzChromium.executablePath(),
            headless: true,
        });
    } else {
        // Твои локальные настройки с анти-детектом
        console.log('[!] Запуск локального Chromium...');
        browser = await chromium.launch({
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-infobars',
                '--ignore-certificate-errors',
            ]
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

    // Твой скрипт скрытия автоматизации
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
    });

    try {
        // 1. Логин
        await page.goto('https://univer.kstu.kz/user/login', { waitUntil: 'domcontentloaded' });
        await page.fill('input[type="text"]', username);
        await page.fill('input[type="password"]', password);

        // Кликаем и ждем навигации (более надежно, чем просто таймаут)
        await Promise.all([
            page.click('input[type="submit"]'),
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => { })
        ]);

        if (page.url().includes('login')) {
            console.log('[!] Ошибка: Не удалось войти.');
            throw new Error('Login failed');
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
            await page.screenshot({ path: 'schedule_not_found.png', fullPage: true });
            throw e;
        }

        // 4. Парсинг (твой evaluate без изменений)
        const resultObject = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.schedule tr')).slice(1);
            if (rows.length === 0) return { parsedData: [] };

            const cleanText = (text) => {
                if (!text) return "";
                // Убираем "Период с 26.01 по 09.05 знаменатель" и подобные вставки
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

        await browser.close();
        return resultObject.parsedData;

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