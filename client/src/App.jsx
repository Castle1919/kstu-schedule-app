import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './App.module.css';

function Login() {
  const navigate = useNavigate();
  // Состояние текущей темы (светлая/темная)
  const [theme] = useState(localStorage.getItem('theme') || 'light');

  // Применяем тему к корневому элементу при загрузке
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Определение адреса API в зависимости от окружения
  const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : 'https://kstu-schedule-app-server.vercel.app';

  // Обработка входа и получения расписания
  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!username || !password) {
      setError('Заполните все поля');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Попытка входа с использованием существующей сессии (ускорение до 2сек)
      const savedSession = localStorage.getItem('userSession');
      const session = savedSession ? JSON.parse(savedSession) : null;

      const response = await axios.post(`${API_URL}/api/schedule`, {
        username,
        password,
        session
      });

      if (response.data && response.data.schedule) {
        localStorage.setItem('username', username);
        localStorage.setItem('password', password);
        localStorage.setItem('userSchedule', JSON.stringify(response.data.schedule));
        localStorage.setItem('serverWeek', response.data.week);
        localStorage.setItem('serverWeekType', response.data.weekType);

        // Сохраняем сессию для следующего раза (Уровень 2)
        if (response.data.session) {
          localStorage.setItem('userSession', JSON.stringify(response.data.session));
        }

        localStorage.setItem('isScheduleLoaded', 'true');
        localStorage.setItem('lastUpdate', Date.now().toString());

        navigate('/schedule');
      } else {
        setError('Сервер не прислал данные расписания.');
      }
    } catch (e) {
      if (e.response?.status === 401) {
        setError('Неверный логин или пароль');
        localStorage.removeItem('userSession'); // Удаляем битую сессию
      } else {
        setError('Ошибка сервера. Попробуйте позже.');
      }
    } finally {
      setLoading(false);
    }
  };

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