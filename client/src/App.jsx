import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './App.module.css';

function Login() {
  const navigate = useNavigate();
  const [theme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();

    if (!username || !password) {
      setError('Заполните все поля');
      return;
    }

    setError('');
    setLoading(true);

    try {
      console.log('Попытка входа для:', username);

      // --- ВОТ ТУТ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ ---
      // Вместо удаления по одному, очищаем ВСЁ хранилище. 
      // Это убьёт старое расписание 100%.
      localStorage.clear();

      const response = await axios.post('https://kstu-schedule-app-server.vercel.app/api/schedule', {
        username,
        password
      });

      if (response.data && Array.isArray(response.data)) {
        // Проверяем, что сервер реально прислал новые данные
        console.log('Данные получены, сохраняю свежее расписание...');

        // Сохраняем логин и новое расписание
        localStorage.setItem('username', username);
        localStorage.setItem('password', password);
        localStorage.setItem('userSchedule', JSON.stringify(response.data));

        // Маленькая хитрость: добавляем метку времени, чтобы страница расписания 
        // поняла, что данные обновились
        localStorage.setItem('lastUpdate', Date.now().toString());

        navigate('/schedule');
      } else {
        setError('Сервер не прислал данные расписания.');
      }

    } catch (e) {
      console.error('Ошибка при входе:', e);
      if (e.response?.status === 401) {
        setError('Неверный логин или пароль (КарТУ)');
      } else {
        setError('Ошибка сервера или парсера. Проверьте консоль бэкенда.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Функция для входа по нажатию Enter
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>🎓</div>
          <h2>Univer KSTU</h2>
          <p style={{ fontSize: '12px', color: '#666' }}>Вход в систему расписания</p>
        </div>

        <div className={styles.form}>
          {error && (
            <div style={{
              color: '#d32f2f',
              backgroundColor: '#ffebee',
              padding: '10px',
              borderRadius: '4px',
              marginBottom: '15px',
              textAlign: 'center',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label>Логин</label>
            <input
              type="text"
              placeholder="логин"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
          </div>

          <div className={styles.field}>
            <label>Пароль</label>
            <input
              type="password"
              placeholder="пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
          </div>

          <button
            className={styles.button}
            onClick={handleLogin}
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span className={styles.spinner}></span> Заходим в Универ...
              </span>
            ) : 'Войти'}
          </button>
        </div>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: '#999' }}>
          <div>Authors: WildMaks456 & Castle1919</div>
        </div>
      </div>
    </div>
  );
}

export default Login;