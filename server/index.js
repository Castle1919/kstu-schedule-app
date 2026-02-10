import express from 'express';
import cors from 'cors';
import NodeCache from 'node-cache';
import { login, createJarFromCookies } from './utils/auth.js';
import { getSemesterInfo, fetchSchedule, parseSchedule } from './utils/schedule.js';

const app = express();
// Кэш на 30 минут (разгружаем сервер Универа)
const scheduleCache = new NodeCache({ stdTTL: 1800, checkperiod: 600 });

app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://kstu-schedule-app-client.vercel.app'
        // Добавь сюда свой домен новой версии, если он отличается
    ],
    credentials: true
}));
app.use(express.json());

// Функция-оркестратор
async function getScheduleData(username, password, existingCookies = null) {
    const cacheKey = `schedule_${username}`;
    console.log(`[API] Запрос расписания для: ${username}`);

    // 1. ПРОВЕРКА КЭША
    // Мы отдаем кэш только если у нас ЕСТЬ сессия (existingCookies) и НЕТ попытки входа по паролю
    // Если пользователь вводит пароль вручную — мы игнорируем кэш и идем проверять его в Универ
    const cachedData = scheduleCache.get(cacheKey);
    if (cachedData && existingCookies && !password) {
        console.log(`[Cache] Данные отданы из кэша для: ${username}`);
        return { ...cachedData, fromCache: true };
    }

    let jar;
    let newSession = null;

    try {
        // 2. ЛОГИКА АВТОРИЗАЦИИ
        if (existingCookies && existingCookies.aspxAuth && !password) {
            // Используем старые куки, только если не пришел новый пароль
            console.log(`[API] Используем существующую сессию для: ${username}`);
            jar = await createJarFromCookies(existingCookies);
        } else {
            // Если пришел пароль или нет сессии — ВСЕГДА идем на сервер Универа
            console.log(`[API] Выполняем проверку логина/пароля для: ${username}`);
            const authData = await login(username, password);
            jar = authData.jar;
            newSession = {
                aspxAuth: authData.aspxAuth,
                sessionId: authData.sessionId
            };
        }

        // 3. ПОЛУЧЕНИЕ HTML
        let html;
        try {
            html = await fetchSchedule(jar);
        } catch (e) {
            if (e.message === 'SessionExpired') {
                if (password) {
                    // Если даже с паролем говорит "сессия истекла", значит пароль не подошел или API тупит
                    throw new Error('Invalid login or password');
                }
                console.log('[API] Сессия истекла. Повторная авторизация...');
                const authData = await login(username, password);
                jar = authData.jar;
                newSession = { aspxAuth: authData.aspxAuth, sessionId: authData.sessionId };
                html = await fetchSchedule(jar);
            } else {
                throw e;
            }
        }

        // 4. ПАРСИНГ И РЕЗУЛЬТАТ
        const parsedData = parseSchedule(html);

        // Если парсер вернул null (в твоем коде это признак протухшей сессии)
        if (parsedData === null) {
            throw new Error('SessionExpired');
        }

        const info = getSemesterInfo();
        console.log(`[API] Рассчитана неделя: ${info.weekNumber}`);

        const result = {
            schedule: parsedData || [],
            week: info.weekNumber,
            weekType: info.weekNumber % 2 === 1 ? 'numerator' : 'denominator',
            session: newSession
        };

        // СОХРАНЯЕМ В КЭШ НА 1 ЧАС (3600 секунд)
        if (parsedData && parsedData.length > 0) {
            scheduleCache.set(cacheKey, result, 3600);
        }

        return result;

    } catch (error) {
        // КРИТИЧЕСКИЙ МОМЕНТ: Если пароль неверный — удаляем кэш подчистую!
        if (error.message === 'Invalid login or password') {
            console.warn(`[API] ОЧИСТКА КЭША для ${username} из-за ошибки входа`);
            scheduleCache.del(cacheKey);
        }
        throw error; // Пробрасываем ошибку дальше, чтобы сработал статус 401
    }
}

app.post('/api/schedule', async (req, res) => {
    const { username, password, session } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Login and password required' });
    }

    try {
        const result = await getScheduleData(username, password, session);
        res.json(result);
    } catch (error) {
        // Четкая обработка ошибок для фронтенда
        if (error.message === 'Invalid login or password' || error.message === 'SessionExpired') {
            console.warn(`[API] Ошибка доступа для ${username}: ${error.message}`);
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }

        console.error('[API] Server Error:', error);
        res.status(500).json({
            error: 'Внутренняя ошибка сервера',
            details: error.message
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));