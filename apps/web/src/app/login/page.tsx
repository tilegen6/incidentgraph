'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Network, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/utils';
export default function Login() {
  const router = useRouter();
  const client = useQueryClient();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      await client.invalidateQueries({ queryKey: ['session'] });
      router.push('/app/overview');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <Link href="/" className="login-logo">
        <Logo />
      </Link>
      <div className="login-card">
        <span className="login-symbol">
          <Network size={27} />
        </span>
        <h1>Your next investigation starts here.</h1>
        <p>Sign in to declare incidents, update status, and share investigation notes.</p>
        <form className="form-stack" onSubmit={submit}>
          <label>
            Email address
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              defaultValue="demo@incidentgraph.dev"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              defaultValue="investigate-demo"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button variant="default" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Enter demo workspace'}
            <ArrowRight size={15} />
          </Button>
        </form>
        <div className="login-note">
          <ShieldCheck size={15} />
          <span>Demo credentials are prefilled. No account needed.</span>
        </div>
        <Link href="/app/overview" className="back-link">
          <ArrowLeft size={13} />
          Explore without signing in
        </Link>
      </div>
      <footer>INCIDENTGRAPH · BUILT FOR THE MOMENT IT MATTERS</footer>
    </main>
  );
}
