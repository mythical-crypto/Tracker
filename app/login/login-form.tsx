'use client';

import { FormEvent, useState } from 'react';

export default function LoginForm({ destination }: { destination: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

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
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="username">Логин</label>
      <input id="username" name="username" type="text" autoComplete="username" required maxLength={128} />
      <label htmlFor="password">Пароль</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} />
      {error && <p className="login-error" role="alert">{error}</p>}
      <button type="submit" disabled={pending}>{pending ? 'Входим…' : 'Войти'}</button>
    </form>
  );
}
