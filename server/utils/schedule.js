import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import * as cheerio from 'cheerio';
import { format, startOfWeek, addDays, getMonth, getYear, differenceInWeeks } from 'date-fns';

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive',
    'Cache-Control': 'max-age=0'
};

/**
 * Расчет семестра и недели (26.01.2026 - начало учебы)
 */
export function getSemesterInfo() {
    const now = new Date();
    const month = getMonth(now) + 1;
    const year = getYear(now);

    let semester, academicYear;
    if (month >= 9) {
        semester = 1;
        academicYear = year;
    } else {
        semester = 2;
        academicYear = year - 1;
    }

    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = addDays(start, 6);

    // Точная дата начала 2-го семестра для КГТУ
    const studyStart = new Date(2026, 0, 26);
    const weekNumber = differenceInWeeks(now, studyStart) + 1;

    return {
        year: academicYear,
        semester: semester,
        startDate: format(start, 'dd.MM.yyyy'),
        endDate: format(end, 'dd.MM.yyyy'),
        weekNumber: weekNumber > 0 ? weekNumber : 1
    };
}

/**
 * Загрузка страницы (с фиксом языка и кук)
 */
export async function fetchSchedule(jar) {
    const client = wrapper(axios.create({ jar, headers: DEFAULT_HEADERS }));
    const info = getSemesterInfo();
    const scheduleUrl = `https://univer.kstu.kz/student/myschedule/${info.year}/${info.semester}/${info.startDate}/${info.endDate}/`;

    try {
        // Установка RU языка
        await client.get('https://univer.kstu.kz/lang/change/ru/', {
            headers: { 'Referer': scheduleUrl }
        });

        console.log(`[Schedule] Запрос страницы: ${scheduleUrl}`);
        const response = await client.get(scheduleUrl);

        if (response.request.res.responseUrl && response.request.res.responseUrl.includes('login')) {
            throw new Error('SessionExpired');
        }

        return response.data;
    } catch (error) {
        console.error('[Schedule] Ошибка запроса:', error.message);
        throw error;
    }
}

/**
 * ТВОЙ ОРИГИНАЛЬНЫЙ ПАРСЕР (БЕЗ ИЗМЕНЕНИЙ В ЛОГИКЕ)
 */
export function parseSchedule(html) {
    const $ = cheerio.load(html);
    const pageTitle = $('title').text().trim();

    // Проверка на редирект (если сессия истекла)
    if ($('input[name="login"]').length > 0 && pageTitle.toLowerCase().includes('вход')) {
        return null;
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

        const rowCells = [];
        const dayColumns = allCells.slice(1);

        for (let j = 0; j < 6; j++) {
            const cell = $(dayColumns[j]);
            const lessonsInDay = [];
            // Тот самый поиск по div[style]
            const lessonDivs = cell.find('div[style]');

            lessonDivs.each((k, div) => {
                const $div = $(div);

                let type = 'all';
                const denomElem = $div.find('.denominator');
                if (denomElem.length > 0) {
                    const dt = clean(denomElem.text()).toLowerCase();
                    if (dt.includes('чис')) type = 'numerator';
                    else if (dt.includes('знам')) type = 'denominator';
                }

                let room = "";
                const audElem = $div.find('.aud_faculty');
                if (audElem.length > 0) {
                    const prefix = clean(audElem.text());
                    const fullText = clean($div.text());
                    const audienceMatch = fullText.match(/Ауд\.:\s*[^\s]+/i);
                    const audienceStr = audienceMatch ? audienceMatch[0] : "";
                    room = `${prefix} ${audienceStr}`.trim();
                }

                const pTag = $div.find('p');
                const teacherRegex = /([А-ЯЁӘҒҚҢӨҰҮҺІ][а-яёәғқңөұүһі\-]+\s+[А-ЯЁӘҒҚҢӨҰҮҺІ]\.\s*[А-ЯЁӘҒҚҢӨҰҮҺІ]\.)/;

                let combinedText = clean($div.text());

                if (room) {
                    combinedText = combinedText.replace(room, '');
                    const roomNoSpaces = room.replace(/\s+/g, '');
                    combinedText = combinedText.replace(roomNoSpaces, '');
                }

                if (denomElem.length > 0) {
                    const dt = clean(denomElem.text());
                    combinedText = combinedText.replace(dt, '');
                    combinedText = combinedText.replace(dt.replace(/\s+/g, ''), '');
                }

                combinedText = combinedText.replace(/Период с \d{2}\.\d{2} по \d{2}\.\d{2}/gi, '');
                combinedText = clean(combinedText);

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

                subject = cleanSubject(subject)
                    .replace(/Ауд\.:.*/gi, '')
                    .replace(/Кабинет:.*/gi, '')
                    .trim();
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
            rowCells.push(lessonsInDay);
        }
        parsedData.push(rowCells);
    });

    console.log(`[Parser] Обработка завершена. Всего строк: ${parsedData.length}`);
    return parsedData;
}