import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

/**
 * Функция авторизации в системе Универ
 */
export async function login(username, password) {
    const jar = new CookieJar();
    const client = wrapper(axios.create({ jar }));

    const loginUrl = 'https://univerapi.kstu.kz/';
    const params = new URLSearchParams({
        login: username,
        password: password
    });

    try {
        // console.log(`[Auth] Попытка входа для ${username}...`);
        const response = await client.get(loginUrl, { params });

        // Проверка наличия кук после авторизации
        const cookies = await jar.getCookies(loginUrl);
        const aspxAuth = cookies.find(c => c.key === '.ASPXAUTH');
        const sessionId = cookies.find(c => c.key === 'ASP.NET_SessionId');

        if (!aspxAuth) {
            // console.error('[Auth] Ошибка: кука .ASPXAUTH не найдена.');
            throw new Error('Invalid login or password');
        }

        // Принудительная установка кук для основного домена .kstu.kz
        const domains = ['.kstu.kz', 'univer.kstu.kz'];
        for (const domain of domains) {
            await jar.setCookie(`.ASPXAUTH=${aspxAuth.value}; Domain=${domain}; Path=/`, `https://${domain.startsWith('.') ? domain.substring(1) : domain}`);
            if (sessionId) {
                await jar.setCookie(`ASP.NET_SessionId=${sessionId.value}; Domain=${domain}; Path=/`, `https://${domain.startsWith('.') ? domain.substring(1) : domain}`);
            }
        }

        // console.log('[Auth] Авторизация успешна.');
        return {
            token: aspxAuth.value,
            sessionId: sessionId ? sessionId.value : null,
            jar
        };
    } catch (error) {
        if (error.response && error.response.status === 401) {
            throw new Error('Invalid login or password');
        }
        // console.error('[Auth] Ошибка при входе:', error.message);
        throw error;
    }
}
