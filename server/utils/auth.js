import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import https from 'https';

// Настраиваем агент для переиспользования TCP-соединений (ускоряет запросы)
export const sharedAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 10, // Ограничиваем кол-во сокетов для Vercel
    keepAliveMsecs: 15000 // Таймаут 15 сек
});

/**
 * Создает CookieJar и "размазывает" куки по всему домену .kstu.kz
 * Это критично, чтобы авторизация с univerapi работала на основном сайте
 */
export async function createJarFromCookies(rawCookies) {
    const jar = new CookieJar();
    // Список доменов, куда нужно подсунуть куки
    const domains = ['.kstu.kz', 'univer.kstu.kz'];

    if (rawCookies && typeof rawCookies === 'object') {
        // Если нам передали уже готовые токены (например, из кэша или фронта)
        for (const domain of domains) {
            const baseUrl = `https://${domain.startsWith('.') ? domain.substring(1) : domain}`;

            if (rawCookies.aspxAuth) {
                await jar.setCookie(`.ASPXAUTH=${rawCookies.aspxAuth}; Domain=${domain}; Path=/`, baseUrl);
            }
            if (rawCookies.sessionId) {
                await jar.setCookie(`ASP.NET_SessionId=${rawCookies.sessionId}; Domain=${domain}; Path=/`, baseUrl);
            }
        }
    }
    return jar;
}

/**
 * Функция авторизации через скрытое API
 */
export async function login(username, password) {
    console.log(`[Auth] Попытка входа для пользователя: ${username}...`);

    const jar = new CookieJar();
    const client = wrapper(axios.create({
        jar,
        // httpsAgent: sharedAgent,
        // Важно: отключаем автоматический редирект, чтобы поймать куки сразу
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400 // Принимаем 302 как успех
    }));

    // ИСПОЛЬЗУЕМ URLSearchParams ДЛЯ ПРАВИЛЬНОЙ КОДИРОВКИ СПЕЦСИМВОЛОВ (@, #, &)
    const params = new URLSearchParams();
    params.append('login', username);
    params.append('password', password);

    const loginUrl = 'https://univerapi.kstu.kz/';

    try {
        // Отправляем запрос с правильно закодированными параметрами
        const response = await client.get(`${loginUrl}?${params.toString()}`);

        // Проверка 1: Если API вернуло JSON с ошибкой (код != 0)
        if (response.data && typeof response.data === 'object') {
            if (response.data.code !== 0) {
                console.warn(`[Auth] Ошибка API: ${response.data.message}`);
                throw new Error('Invalid login or password');
            }
        }

        // Проверка 2: Ищем куки в ответе
        const cookies = await jar.getCookies(loginUrl);
        const aspxAuth = cookies.find(c => c.key === '.ASPXAUTH');
        const sessionId = cookies.find(c => c.key === 'ASP.NET_SessionId');

        if (!aspxAuth) {
            console.error('[Auth] Ошибка: Сервер не вернул токен .ASPXAUTH');
            throw new Error('Invalid login or password');
        }

        // Принудительно прописываем куки для всех поддоменов, чтобы сессия не терялась
        const targetDomains = ['.kstu.kz', 'univer.kstu.kz'];
        for (const domain of targetDomains) {
            const baseUrl = `https://${domain.startsWith('.') ? domain.substring(1) : domain}`;
            await jar.setCookie(`.ASPXAUTH=${aspxAuth.value}; Domain=${domain}; Path=/`, baseUrl);
            if (sessionId) {
                await jar.setCookie(`ASP.NET_SessionId=${sessionId.value}; Domain=${domain}; Path=/`, baseUrl);
            }
        }

        console.log('[Auth] Авторизация успешна. Токены получены.');
        return {
            aspxAuth: aspxAuth.value,
            sessionId: sessionId ? sessionId.value : null,
            jar // Возвращаем настроенный jar для дальнейших запросов
        };

    } catch (error) {
        // Если это наша ошибка — прокидываем дальше
        if (error.message === 'Invalid login or password') {
            throw error;
        }
        // Если ошибка сети или сервера
        console.error('[Auth] Критическая ошибка при запросе:', error.message);
        throw new Error('Auth service unavailable');
    }
}