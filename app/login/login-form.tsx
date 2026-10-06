'use client';

import { FormEvent, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginForm({ destination }: { destination: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
      });
      if (!response.ok) {
        setError(response.status === 429 ? 'Слишком много попыток. Подождите 15 минут.' : 'Неверный логин или пароль.');
        return;
      }
      window.location.assign(destination);
    } catch {
      setError('Не удалось выполнить вход. Проверьте соединение и повторите попытку.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="public-login-form" onSubmit={submit}>
      <div className="public-login-field">
        <label htmlFor="username">Логин</label>
        <input id="username" name="username" type="text" autoComplete="username" required maxLength={128} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} />
      </div>
      <div className="public-login-field">
        <label htmlFor="password">Пароль</label>
        <div className="public-password-input">
          <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={1024} aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} />
          <button type="button" className="public-password-toggle" aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
            {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {error && <p id="login-error" className="public-login-error" role="alert">{error}</p>}
      <button className="public-primary-button public-login-submit" type="submit" disabled={pending}>{pending ? 'Входим…' : 'Войти'}</button>
    </form>
  );
}
