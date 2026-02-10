import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import styles from './App.module.css';

function Login() {
  const navigate = useNavigate();
  const [theme] = useState(localStorage.getItem('theme') || 'light');

  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  const [password, setPassword] = useState(localStorage.getItem('password') || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : 'https://kstu-schedule-app-server.vercel.app';

  // Оборачиваем handleLogin в useCallback, чтобы вызвать его внутри useEffect
  const handleLogin = useCallback(async (e, isAutoLogin = false) => {
    if (e) e.preventDefault();

    // Если это не авто-вход, проверяем поля
    if (!isAutoLogin && (!username || !password)) {
      setError('Заполните все поля');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const savedSession = localStorage.getItem('userSession');
      const session = savedSession ? JSON.parse(savedSession) : null;
      const lastLoginTime = localStorage.getItem('lastLoginTime');

      // Логика "входа на час": если прошло больше 60 минут, не шлем старую сессию
      const isSessionExpired = lastLoginTime && (Date.now() - parseInt(lastLoginTime) > 3600000);

      const response = await axios.post(`${API_URL}/api/schedule`, {
        username,
        password,
        session: isSessionExpired ? null : session // Если час прошел, заставляем сервер перелогиниться
      });

      if (response.data && response.data.schedule) {
        // Сохраняем учетки для удобства (но пароль лучше не хранить вечно, либо шифровать)
        localStorage.setItem('username', username);
        localStorage.setItem('password', password);
        localStorage.setItem('userSchedule', JSON.stringify(response.data.schedule));
        localStorage.setItem('serverWeek', response.data.week);
        localStorage.setItem('serverWeekType', response.data.weekType);

        // ОБНОВЛЯЕМ ВРЕМЯ ВХОДА
        localStorage.setItem('lastLoginTime', Date.now().toString());

        if (response.data.session) {
          localStorage.setItem('userSession', JSON.stringify(response.data.session));
        }

        localStorage.setItem('isScheduleLoaded', 'true');
        navigate('/schedule');
      }
    } catch (e) {
      console.error(e);
      if (e.response?.status === 401) {
        setError('Неверный логин или пароль');
        localStorage.removeItem('userSession');
        localStorage.removeItem('lastLoginTime');
      } else {
        setError('Ошибка сервера. Попробуйте позже.');
      }
    } finally {
      setLoading(false);
    }
  }, [username, password, navigate, API_URL]);

  // ЭФФЕКТ: Автоматический вход при открытии браузера
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    const checkAutoLogin = async () => {
      const savedUser = localStorage.getItem('username');
      const savedPass = localStorage.getItem('password');
      const lastLoginTime = localStorage.getItem('lastLoginTime');

      // Если есть данные и прошло меньше часа — пробуем войти сами
      if (savedUser && savedPass && lastLoginTime) {
        const diff = Date.now() - parseInt(lastLoginTime);
        if (diff < 3600000) { // 1 час в миллисекундах
          handleLogin(null, true);
        }
      }
    };

    checkAutoLogin();
  }, [theme, handleLogin]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className={styles.page}>
      {/* Твоя верстка без изменений */}
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>🎓</div>
          <h2>Univer KSTU</h2>
          <p style={{ fontSize: '12px', color: '#666' }}>Вход в систему расписания</p>
        </div>

        <div className={styles.form}>
          {/* {error && <div className={styles.errorMessage}>{error}</div>}
           */}
          {error && (
            <div className={styles.errorMessage}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              {error}
            </div>
          )}

          <div className={styles.field}>
            <label>Логин</label>
            <input
              type="text"
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
          </div>
          {/* 
          <button className={styles.button} onClick={handleLogin} disabled={loading}>
            {loading ? 'Заходим в Универ...' : 'Войти'}
          </button> */}
          <button
            className={styles.button}
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div className={styles.spinner}></div>
                <span>Заходим в Универ...</span>
              </div>
            ) : (
              'Войти'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;