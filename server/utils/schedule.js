import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import * as cheerio from 'cheerio';
import { format, startOfWeek, addDays, getMonth, getYear, differenceInWeeks } from 'date-fns';
import { sharedAgent } from './auth.js';

// Заголовки для имитации браузера
const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0'
};

/**
 * Получение информации о текущем семестре и датах недели
 */
export function getSemesterInfo() {
    const now = new Date();
    const month = getMonth(now) + 1;
    const year = getYear(now);

    let semester, academicYear;
    if (month >= 9) {
        semester = 1; // Осенний семестр
        academicYear = year;
    } else {
        semester = 2; // Весенний семестр
        academicYear = year - 1;
    }

    // Даты начала семестров по логике KSTU
    const semesterStart = (semester === 1)
        ? new Date(year, 8, 1) // 1 сентября
        : new Date(year, 0, 26); // 26 января

    const monday = startOfWeek(now, { weekStartsOn: 1 });
    const sunday = addDays(monday, 6);

    // Расчет текущей недели учебного процесса
    const weekNumber = Math.min(Math.max(differenceInWeeks(now, semesterStart) + 1, 1), 20);

    return {
        year: academicYear,
        semester,
        start: format(monday, 'dd.MM.yyyy'),
        end: format(sunday, 'dd.MM.yyyy'),
        weekNumber
    };
}

/**
 * Загрузка HTML-страницы расписания с сайта Универ
 */
export async function fetchSchedule(jar) {
    const client = wrapper(axios.create({
        jar,
        headers: DEFAULT_HEADERS,
        httpsAgent: sharedAgent // Используем общий Keep-Alive агент
    }));

    const { year, semester, start, end } = getSemesterInfo();

    // Однако, мы используем один и тот же клиент для сохранения сессии.
    console.log('[Schedule] Установка языка RU...');
    await client.get('https://univer.kstu.kz/lang/change/ru/');

    const scheduleUrl = `https://univer.kstu.kz/student/myschedule/${year}/${semester}/${start}/${end}/`;

    // Запрос страницы
    console.log(`[Schedule] Запрос страницы: ${scheduleUrl}`);
    const response = await client.get(scheduleUrl, {
        headers: {
            ...DEFAULT_HEADERS,
            'Referer': 'https://univer.kstu.kz/student/myschedule/'
        }
    });

    console.log(`[Schedule] HTTP Статус: ${response.status}, Длина HTML: ${response.data.length}`);
    return response.data;
}

/**
 * Парсинг HTML-кода расписания
 */
export function parseSchedule(html) {
    const $ = cheerio.load(html);
    const pageTitle = $('title').text().trim();

    // Проверка на редирект (если сессия истекла)
    if ($('input[name="login"]').length > 0 && pageTitle.toLowerCase().includes('вход')) {
        return null; // Возвращаем null вместо [], чтобы сервер понял, что сессия протухла
    }

    const rows = $('.schedule tr');
    const lessonsRows = rows.slice(1);

    const clean = (text) => (text || "").trim().replace(/\s+/g, ' ');
    const cleanSubject = (text) => {
        let t = clean(text);
        t = t.replace(/Период с \d{2}\.\d{2} по \d{2}\.\d{2}/gi, '');
        t = t.replace(/(числитель|знаменатель)/gi, '');
        return clean(t);
    };

    const parsedData = [];

    lessonsRows.each((i, row) => {
        const $row = $(row);
        const allCells = $row.find('td, th');
        if (allCells.length < 2) return;

        // Поиск времени пары через регулярное выражение
        const timeRegex = /\d{1,2}[:.]\d{2}[-–\s]+\d{1,2}[:.]\d{2}/;
        let rowTime = "";
        const firstCell = $(allCells[0]);
        const firstCellText = firstCell.text().trim();
        const timeMatch = firstCellText.match(timeRegex);

        if (timeMatch) {
            rowTime = timeMatch[0].replace(/\s+/g, '').replace(/\./g, ':');
        } else {
            const rowText = $row.text().trim();
            const globalMatch = rowText.match(timeRegex);
            if (globalMatch) rowTime = globalMatch[0].replace(/\s+/g, '').replace(/\./g, ':');
        }

        if (!rowTime) {
            rowTime = firstCellText.split('\n')[0].trim();
        }

        const dayCells = [];
        const days = $row.find('td.field');

        for (let j = 0; j < 6; j++) {
            const cell = days.eq(j);
            const lessonsInDay = [];
            const lessonDivs = cell.find('div[style]');

            lessonDivs.each((k, div) => {
                const $div = $(div);

                // Извлечение типа недели
                let type = 'all';
                const denomElem = $div.find('.denominator');
                if (denomElem.length > 0) {
                    const dt = clean(denomElem.text()).toLowerCase();
                    if (dt.includes('чис')) type = 'numerator';
                    else if (dt.includes('знам')) type = 'denominator';
                }

                // Извлечение аудитории
                let room = "";
                const audElem = $div.find('.aud_faculty');
                if (audElem.length > 0) {
                    const prefix = clean(audElem.text());
                    const fullText = clean($div.text());
                    const audienceMatch = fullText.match(/Ауд\.:\s*[^\s]+/i);
                    const audienceStr = audienceMatch ? audienceMatch[0] : "";
                    room = `${prefix} ${audienceStr}`.trim();
                }

                // Извлечение предмета и преподавателя
                const pTag = $div.find('p');
                let combinedText = clean($div.text());

                if (room) combinedText = combinedText.replace(room, '');
                if (denomElem.length > 0) combinedText = combinedText.replace(clean(denomElem.text()), '');
                combinedText = combinedText.replace(/Период с \d{2}\.\d{2} по \d{2}\.\d{2}/gi, '');
                combinedText = clean(combinedText);

                // Регулярка для поиска фамилии преподавателя
                const teacherRegex = /([А-ЯЁ][а-яёА-ЯЁ\-]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.)/;
                const match = combinedText.match(teacherRegex);

                let subject = combinedText;
                let teacher = "";

                if (match) {
                    teacher = match[1];
                    subject = clean(combinedText.split(teacher)[0]);
                } else if (pTag.length > 0) {
                    subject = cleanSubject(pTag.text());
                    const nextNode = pTag[0].nextSibling;
                    if (nextNode && nextNode.nodeValue) {
                        teacher = clean(nextNode.nodeValue);
                    }
                }

                subject = cleanSubject(subject);
                subject = subject.replace(/[.,:;]+$/, "").trim();

                if (subject) {
                    lessonsInDay.push({
                        time: rowTime,
                        subject: subject,
                        teacher: teacher,
                        room: room,
                        type: type
                    });
                }
            });
            dayCells.push(lessonsInDay);
        }
        parsedData.push(dayCells);
    });

    return parsedData;
}
